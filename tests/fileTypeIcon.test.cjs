const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')

function harness(native = true) {
  const calls = []
  const events = {}
  const mocks = {
    vue,
    '@tauri-apps/api/core': {
      isTauri: () => native,
      invoke: (command, args) => {
        calls.push({ command, args })
        return Promise.resolve(`icon:${args.directory ? 'folder' : args.extension}`)
      },
    },
  }
  const context = { exports: {}, window: { addEventListener: (event, callback) => { events[event] = callback } },
    require: name => mocks[name] }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/composables/useFileTypeIcon.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return { ...context.exports, calls, events }
}

test('system type lookup handles Windows paths, uppercase extensions, dotfiles and deleted-file names', () => {
  const { fileTypeExtension } = harness()
  for (const [path, expected] of [['dir/a.PHP', 'php'], ['C:\\wc\\file.SQL', 'sql'], ['.htaccess', 'htaccess'],
    ['archive.tar.gz', 'gz'], ['README', ''], ['dir.with.dot/README', '']]) {
    assert.equal(fileTypeExtension(path), expected)
  }
})

test('type and directory requests share in-flight work and reload associations on app focus', async () => {
  const h = harness()
  const first = h.useFileTypeIcon()
  const second = h.useFileTypeIcon()
  const pending = first.load('php', false)
  assert.equal(second.load('php', false), pending)
  await pending
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].command, 'file_type_icon')
  assert.equal(await first.load('', true), 'icon:folder')
  assert.equal(await second.load('folder.name', true), 'icon:folder')
  assert.equal(h.calls.length, 2)
  h.events.focus()
  assert.equal(first.revision.value, 1)
  assert.notEqual(first.load('php', false), pending)
  assert.equal(h.calls.length, 3)
})

test('browser preview uses the fallback without calling native APIs', async () => {
  const h = harness(false)
  assert.equal(await h.useFileTypeIcon().load('php', false), null)
  assert.equal(h.calls.length, 0)
})

test('type cache stays bounded', async () => {
  const h = harness()
  const { load } = h.useFileTypeIcon()
  const original = load('type0', false)
  for (let i = 1; i <= 256; i++) await load(`type${i}`, false)
  assert.notEqual(load('type0', false), original)
})
