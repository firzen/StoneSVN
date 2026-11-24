const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')

function compile(file, mocks, globals = {}) {
  const context = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name] }, URL, ...globals }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  return context.exports
}
function failure(code, url = 'https://qi@legacy.example:8443/svn/repo') {
  return `SVN command failed: svn: E170013: Unable to connect to a repository at URL '${url}'\nsvn: ${code}: failed`
}
function harness({ run = async () => 'ok', confirm = async () => {}, configureError, saved = {} } = {}) {
  const settings = { svnServerSecurity: saved }, calls = [], dialogs = [], configurations = []
  const invoke = async (command, args) => {
    if (command === 'configure_svn_server_security') {
      configurations.push(args)
      if (configureError) throw configureError
      return args.server
    }
    calls.push({ command, args })
    return run(command, args)
  }
  const mocks = {
    '@tauri-apps/api/core': { invoke },
    'element-plus/es/components/message-box/index': { ElMessageBox: { confirm: async (...args) => { dialogs.push(args); return confirm(...args) } } },
    vue: { h: (tag, props, children) => ({ tag, props: children === undefined ? {} : props, children: children === undefined ? props : children }) },
    '@/i18n': { default: { global: { t: key => key } } },
    '@/composables/useSettings': { useSettings: () => ({ settings, updateSettings: partial => Object.assign(settings, partial) }) },
  }
  const connection = compile('src/api/connection.ts', mocks)
  const api = compile('src/api/svn.ts', { '@tauri-apps/api/core': { invoke }, './connection': connection })
  return { settings, calls, dialogs, configurations, ...connection, api }
}

test('TLS and certificate failures prompt separately, retry, and preserve choices for other servers', async () => {
  let attempt = 0
  const h = harness({ saved: { 'https://other.example': { legacyTls: false, trustInvalidCertificates: true } }, run: async () => {
    attempt++
    if (attempt === 1) throw failure('E120171')
    if (attempt === 2) throw failure('E230001')
    return 'connected'
  } })
  assert.equal(await h.invokeWithConnectionPrompt('svn_update', { path: '/wc' }), 'connected')
  assert.equal(h.dialogs.length, 2)
  assert.equal(h.calls.length, 3)
  assert.equal(h.settings.svnServerSecurity['https://legacy.example:8443'].legacyTls, true)
  assert.equal(h.settings.svnServerSecurity['https://legacy.example:8443'].trustInvalidCertificates, true)
  assert.ok(h.settings.svnServerSecurity['https://other.example'])
  assert.equal(h.configurations[0].trustInvalidCertificates, false)
  assert.equal(h.configurations[1].legacyTls, true)
  assert.ok(!JSON.stringify(h.dialogs).includes('qi@'))
})

test('a modern server with an invalid certificate is trusted without lowering TLS security', async () => {
  let attempt = 0
  const h = harness({ run: async () => { if (!attempt++) throw failure('E230001'); return 'ok' } })
  await h.invokeWithConnectionPrompt('svn_log', { path: '/wc' })
  assert.equal(h.configurations[0].legacyTls, false)
  assert.equal(h.configurations[0].trustInvalidCertificates, true)
})

test('cancel and close preserve the original error and do not change settings or retry', async () => {
  for (const action of ['cancel', 'close']) {
    const error = failure('E230001')
    const h = harness({ run: async () => { throw error }, confirm: async () => { throw action } })
    await assert.rejects(h.invokeWithConnectionPrompt('svn_log', { path: '/wc' }), value => value === error)
    assert.equal(h.calls.length, 1)
    assert.equal(h.configurations.length, 0)
    assert.equal(Object.keys(h.settings.svnServerSecurity).length, 0)
  }
})

test('unidentifiable errors never request TLS or certificate exceptions', async () => {
  for (const error of ['svn: E120171: no URL', failure('E230001', 'http://legacy.example/repo')]) {
    const h = harness({ run: async () => { throw error } })
    await assert.rejects(h.invokeWithConnectionPrompt('svn_log', {}))
    assert.equal(h.dialogs.length, 0)
    assert.equal(h.calls.length, 1)
  }
})

test('an exception that still fails does not loop or show repeated prompts', async () => {
  const h = harness({ run: async () => { throw failure('E120171') } })
  await assert.rejects(h.invokeWithConnectionPrompt('svn_log', {}))
  assert.equal(h.calls.length, 2)
  assert.equal(h.dialogs.length, 1)
})

test('parallel failures for the same server share a single prompt and each retry their own request', async () => {
  let accept
  const confirmation = new Promise(resolve => { accept = resolve })
  const attempts = new Map()
  const h = harness({ confirm: () => confirmation, run: async (_command, args) => {
    if (!attempts.has(args.id)) { attempts.set(args.id, true); throw failure('E120171') }
    return args.id
  } })
  const a = h.invokeWithConnectionPrompt('svn_log', { id: 'a' })
  const b = h.invokeWithConnectionPrompt('svn_log', { id: 'b' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.dialogs.length, 1)
  accept()
  assert.deepEqual(await Promise.all([a, b]), ['a', 'b'])
  assert.equal(h.configurations.length, 1)
})

test('failed backend configuration is neither saved nor followed by a command retry', async () => {
  const h = harness({ run: async () => { throw failure('E230001') }, configureError: new Error('write failed') })
  await assert.rejects(h.invokeWithConnectionPrompt('svn_log', {}), /write failed/)
  assert.equal(h.calls.length, 1)
  assert.equal(Object.keys(h.settings.svnServerSecurity).length, 0)
})

test('commit checks the connection before publishing and never automatically repeats a failed commit', async () => {
  let probe = 0, commit = 0
  const h = harness({ run: async command => {
    if (command === 'svn_connection_info') { if (!probe++) throw failure('E120171'); return {} }
    if (command === 'svn_commit') { commit++; throw failure('E120171') }
  } })
  await assert.rejects(h.api.svnCommit('/wc', 'message', ['file.txt']))
  assert.equal(probe, 2)
  assert.equal(commit, 1)
  assert.equal(h.dialogs.length, 1)
})

test('cancelled connection approval prevents checkout, commit, switch and merge mutations', async () => {
  const h = harness({ run: async () => { throw failure('E230001') }, confirm: async () => { throw 'cancel' } })
  for (const operation of [() => h.api.svnCheckout('https://legacy.example/repo', '/wc'), () => h.api.svnCommit('/wc', 'message', ['file']), () => h.api.svnSwitch('/wc', 'https://legacy.example/branch'), () => h.api.svnMerge('/wc', 'https://legacy.example/branch', 1, 2)]) {
    await assert.rejects(operation())
  }
  assert.ok(h.calls.every(call => call.command === 'svn_connection_info'))
})

test('old manual settings migrate into host-and-port grants without retaining manual controls', () => {
  const saved = { svnPath: '/opt/homebrew/bin/svn', svnLegacyTlsEnabled: true, svnLegacyTlsServer: 'https://legacy.example:8443', svnLegacyTlsTrustInvalidCertificates: true }
  const module = compile('src/composables/useSettings.ts', { vue: { reactive: value => value, watch: () => {} }, '@/i18n': { detectSystemLocale: () => 'zh-CN' } }, { localStorage: { getItem: () => JSON.stringify(saved) } })
  const { settings } = module.useSettings()
  assert.equal(settings.svnServerSecurity['https://legacy.example:8443'].legacyTls, true)
  assert.equal(settings.svnServerSecurity['https://legacy.example:8443'].trustInvalidCertificates, true)
  assert.equal(settings.svnPath, '/opt/homebrew/bin/svn')
  assert.equal('svnLegacyTlsEnabled' in settings, false)
})


test('authentication uses a password field and retries once without persisting credentials in settings', async () => {
  let attempts = 0
  const h = harness({
    run: async (command) => {
      if (command === 'configure_svn_credentials') return
      if (!attempts++) throw failure('E215004')
      return 'authenticated'
    },
    confirm: async (message) => {
      message.children[1].children[1].children[0].children[0].children.onInput({ target: { value: 'qi' } })
      const input = message.children[2].children[1].children[0].children[0].children
      assert.equal(input.type, 'password')
      input.onInput({ target: { value: 'test-secret' } })
    },
  })
  assert.equal(await h.invokeWithConnectionPrompt('svn_log', {}), 'authenticated')
  assert.equal(h.dialogs.length, 1)
  assert.equal(h.configurations.length, 0)
  assert.equal(h.calls[1].command, 'configure_svn_credentials')
  assert.equal(h.calls[1].args.server, 'https://legacy.example:8443')
  assert.equal(h.calls[1].args.password, 'test-secret')
  assert.ok(!JSON.stringify(h.settings).includes('test-secret'))
})

test('authentication cancellation preserves error; escaped URL extracts username', async () => {
  const error = failure('E215004')
  const h = harness({ run: async () => { throw error }, confirm: async () => { throw 'cancel' } })
  await assert.rejects(h.invokeWithConnectionPrompt('svn_update', {}), value => value === error)
  assert.equal(h.calls.length, 1)
  assert.equal(h.configurations.length, 0)
  assert.equal(h.parseAuthFailure(error.replace('https:', 'https\\:')).username, 'qi')
})

test('rejected credentials do not cause repeated prompts or retry a commit mutation', async () => {
  let confirmations = 0
  const error = failure('E215004')
  const h = harness({
    run: async command => { if (command !== 'configure_svn_credentials') throw error },
    confirm: async message => {
      confirmations++
      message.children[2].children[1].children[0].children[0].children.onInput({ target: { value: 'wrong-password' } })
    },
  })
  await assert.rejects(h.api.svnCommit('/wc', 'message'), value => value === error)
  assert.equal(confirmations, 1)
  assert.equal(h.calls.filter(call => call.command === 'svn_connection_info').length, 2)
  assert.ok(!h.calls.some(call => call.command === 'svn_commit'))
})

test('authentication then TLS and certificate approvals all fit the retry budget', async () => {
  let attempt = 0
  const h = harness({
    run: async command => {
      if (command === 'configure_svn_credentials') return
      const codes = ['E215004', 'E120171', 'E230001']
      if (attempt < codes.length) throw failure(codes[attempt++])
      return 'connected'
    },
    confirm: async message => {
      if (message.tag === 'form') message.children[2].children[1].children[0].children[0].children.onInput({ target: { value: 'test-password' } })
    },
  })
  assert.equal(await h.invokeWithConnectionPrompt('svn_update', { path: '/wc' }), 'connected')
  assert.equal(h.dialogs.length, 3)
  assert.equal(h.configurations.length, 2)
})

test('concurrent authentication failures share one account prompt', async () => {
  let accept
  const confirmation = new Promise(resolve => { accept = resolve })
  const attempts = new Set()
  const h = harness({
    run: async (command, args) => {
      if (command === 'configure_svn_credentials') return
      if (!attempts.has(args.id)) { attempts.add(args.id); throw failure('E215004') }
      return args.id
    },
    confirm: async message => {
      message.children[2].children[1].children[0].children[0].children.onInput({ target: { value: 'test-password' } })
      await confirmation
    },
  })
  const requests = [h.invokeWithConnectionPrompt('svn_log', { id: 'a' }), h.invokeWithConnectionPrompt('svn_log', { id: 'b' })]
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.dialogs.length, 1)
  accept()
  assert.deepEqual(await Promise.all(requests), ['a', 'b'])
  assert.equal(h.calls.filter(call => call.command === 'configure_svn_credentials').length, 1)
})
