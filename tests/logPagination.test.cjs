const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')

function harness(fetch, { save, exportRevision, messages } = {}) {
  const calls = []
  const store = {
    currentPath: '/wc',
    setError(error) { this.error = error },
    setOperationBusy(busy) { this.operationBusy = busy },
  }
  const mocks = {
    vue: { ...vue, watch() {}, onActivated() {}, onUnmounted() {} },
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/api/svn': {
      svnLog: async (...args) => { calls.push(args); return fetch(...args) },
      svnExportRevision: exportRevision,
    },
    '@tauri-apps/plugin-dialog': { save },
    'element-plus': { ElMessage: messages },
    'vue-i18n': { useI18n: () => ({ t: key => key, locale: vue.ref('en-US') }) },
    '@/composables/useWorkspace': { useWorkspace: () => ({}) },
    'vue-router': { useRouter: () => ({}) },
  }
  const script = fs.readFileSync('src/views/LogView.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const context = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  const code = ts.transpileModule(script + '\nexports.state = { reloadLogs, fetchLogPage, logs, pageIndex, pageCursors, hasMore, loading, filters, selectedLog, exportRevision, exporting, canExportRevision };', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, context)
  return { ...context.exports.state, calls, store }
}
const entries = Array.from({ length: 50 }, (_, index) => ({
  revision: 300 - index * 2, author: index % 2 ? 'alice' : 'bob', message: 'change', date: '', changed_paths: [],
}))
const query = (_path, limit, cursor, _end, _keyword, author) => entries
  .filter(entry => (cursor === undefined || entry.revision <= cursor) && (!author || entry.author === author)).slice(0, limit)

test('explicit pages replace rows, use revision cursors without gaps, and restore previous pages from cache', async () => {
  const h = harness(query)
  await h.reloadLogs()
  assert.equal(h.logs.value.length, 20)
  assert.equal(h.hasMore.value, true)
  assert.equal(h.calls[0][1], 21)
  const first = Array.from(h.logs.value, entry => entry.revision)
  await h.fetchLogPage(1)
  const second = Array.from(h.logs.value, entry => entry.revision)
  assert.equal(h.calls[1][2], first.at(-1) - 1)
  assert.equal(new Set([...first, ...second]).size, 40)
  await h.fetchLogPage(2)
  assert.equal(h.logs.value.length, 10)
  assert.equal(h.hasMore.value, false)
  await h.fetchLogPage(0)
  assert.deepEqual(Array.from(h.logs.value, entry => entry.revision), first)
  assert.equal(h.calls.length, 3)
})

test('filtered results remain bounded and a filter reload resets the page cursor', async () => {
  const h = harness(query)
  await h.reloadLogs()
  await h.fetchLogPage(1)
  h.filters.author = 'alice'
  await h.reloadLogs(true, true)
  assert.equal(h.pageIndex.value, 0)
  assert.equal(h.logs.value.length, 20)
  assert.ok(h.logs.value.every(entry => entry.author === 'alice'))
  assert.equal(h.calls.at(-1)[1], 21)
  assert.equal(h.calls.at(-1)[2], undefined)
  await h.fetchLogPage(1)
  assert.equal(h.logs.value.length, 5)
  assert.equal(h.hasMore.value, false)
})

test('empty and exact-size pages do not offer another page', async () => {
  for (const count of [0, 20]) {
    const h = harness(() => entries.slice(0, count))
    await h.reloadLogs()
    assert.equal(h.logs.value.length, count)
    assert.equal(h.hasMore.value, false)
  }
})

test('late response from a superseded query cannot replace the new page', async () => {
  let finish
  const h = harness((_path, _limit, _cursor, _end, keyword) => keyword === 'new'
    ? [entries[1]] : new Promise(resolve => { finish = resolve }))
  const old = h.reloadLogs()
  h.filters.keyword = 'new'
  await h.reloadLogs(true, true)
  finish([entries[0]])
  await old
  assert.equal(h.logs.value[0].revision, entries[1].revision)
  assert.equal(h.loading.value, false)
})

test('revision export uses the existing save dialog, guards repeated clicks, and skips deletion-only revisions', async () => {
  const exported = []
  const messages = []
  let chooseDestination
  const h = harness(query, {
    save: options => {
      assert.equal(options.defaultPath, 'wc-r42')
      return new Promise(resolve => { chooseDestination = resolve })
    },
    exportRevision: async (...args) => { exported.push(args) },
    messages: { success: message => messages.push(message) },
  })
  h.selectedLog.value = { revision: 42, changed_paths: [{ action: 'D', path: '/deleted' }] }
  assert.equal(h.canExportRevision.value, false)
  await h.exportRevision()
  h.selectedLog.value.changed_paths.push({ action: 'M', path: '/changed' })
  const firstExport = h.exportRevision()
  assert.equal(h.exporting.value, true)
  assert.equal(h.store.operationBusy, true)
  await h.exportRevision()
  chooseDestination('/exports/r42')
  await firstExport
  assert.deepEqual(exported, [['/wc', 42, '/exports/r42']])
  assert.deepEqual(messages, ['properties.exported'])
  assert.equal(h.exporting.value, false)
  assert.equal(h.store.operationBusy, false)
})
