const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')

function harness() {
  const requests = [], saved = []
  const mocks = {
    vue: { reactive: value => value },
    '@/api/svn': { configureSvnExecutable(path) {
      return new Promise((resolve, reject) => requests.push({ path, resolve, reject }))
    } },
    '@/composables/useSettings': { useSettings: () => ({ updateSettings: value => saved.push(value) }) },
  }
  const context = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  const source = fs.readFileSync('src/composables/useSvnRuntime.ts', 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  return { ...context.exports.useSvnRuntime(), requests, saved }
}

test('failed startup discovery blocks workspaces and does not persist an invalid setting', async () => {
  const h = harness()
  const failed = h.configure('')
  assert.equal(h.runtime.checking, true)
  h.requests[0].reject(new Error('SVN not found'))
  assert.equal(await failed, false)
  assert.equal(h.runtime.initialized, false)
  assert.equal(h.runtime.ready, false)
  assert.equal(h.runtime.checking, false)
  assert.match(h.runtime.error, /SVN not found/)
  assert.equal(h.saved.length, 0)

  const fixed = h.configure(' /custom/bin/svn ')
  h.requests[1].resolve('1.14.5')
  assert.equal(await fixed, true)
  assert.equal(h.runtime.ready, true)
  assert.equal(h.runtime.initialized, true)
  assert.equal(h.runtime.error, '')
  assert.equal(h.runtime.version, '1.14.5')
  assert.equal(h.saved[0].svnPath, '/custom/bin/svn')
})

test('duplicate validation coalesces; an invalid replacement preserves saved settings and blocks UI until recovery', async () => {
  const h = harness()
  const first = h.configure('/valid/svn')
  assert.equal(first, h.configure('/other/svn'))
  assert.equal(h.requests.length, 1)
  h.requests[0].resolve('1.14.5')
  await first
  const failed = h.configure('/invalid/svn')
  h.requests[1].reject(new Error('invalid executable'))
  await failed
  assert.equal(h.saved.length, 1)
  assert.equal(h.saved[0].svnPath, '/valid/svn')
  assert.equal(h.runtime.initialized, true)
  assert.equal(h.runtime.ready, false)
  assert.equal(h.runtime.path, '/invalid/svn')

  const retry = h.configure('')
  h.requests[2].resolve('1.14.5')
  assert.equal(await retry, true)
  assert.equal(h.runtime.ready, true)
  assert.equal(h.saved[1].svnPath, '')
})
