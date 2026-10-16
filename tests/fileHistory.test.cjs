const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

function harness(fetch) {
  const calls = [], routes = [], errors = []
  const store = vue.reactive({ currentPath: '/wc' })
  const mocks = {
    vue: { ...vue, watch() {}, onBeforeUnmount() {} },
    'vue-router': { useRoute: () => ({ query: {} }), useRouter: () => ({ push: value => routes.push(value) }) },
    '@tauri-apps/plugin-dialog': { open: async () => null },
    'element-plus/es/components/message/index': { ElMessage: { error: value => errors.push(value), warning: value => errors.push(value) } },
    '@/api/svn': { svnFileLog: async (...args) => { calls.push(args); return fetch(...args) } },
    '@/stores/workspace': { useWorkspaceStore: () => store },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
  }
  const pathContext = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/workspacePath.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, pathContext)
  mocks['@/utils/workspacePath'] = pathContext.exports
  const source = fs.readFileSync('src/views/BlameView.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const context = { exports: {}, sessionStorage: { removeItem() {} }, require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  vm.runInNewContext(ts.transpileModule(source + '\nexports.actions = { currentPath, loadedFile, logs, pageIndex, hasMore, loading, loadHistory, changePage, openRevision };', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
  return { ...context.exports.actions, calls, routes, errors, store }
}
const entries = Array.from({ length: 45 }, (_, i) => ({ revision: 200 - i * 3, author: 'alice', message: `change ${i}` }))

test('file history uses the selected file and revision cursors; a revision opens its change diff', async () => {
  const h = harness(async (_wc, _file, limit, cursor) => entries.filter(row => cursor === undefined || row.revision <= cursor).slice(0, limit))
  h.currentPath.value = '/wc/dir/a.php'
  await h.loadHistory()
  assert.deepEqual(h.calls[0], ['/wc', 'dir/a.php', 21, undefined])
  assert.equal(h.logs.value.length, 20)
  assert.equal(h.hasMore.value, true)
  await h.changePage(1)
  assert.equal(h.calls[1][3], entries[19].revision - 1)
  assert.equal(h.logs.value[0].revision, entries[20].revision)
  await h.changePage(2)
  assert.equal(h.logs.value.length, 5)
  assert.equal(h.hasMore.value, false)
  h.openRevision(h.logs.value[0])
  assert.equal(h.routes[0].name, 'diff')
  assert.equal(h.routes[0].query.path, 'dir/a.php')
  assert.equal(h.routes[0].query.revision, String(entries[40].revision))
})

test('changing files drops late responses and outside-workspace paths never request history', async () => {
  const pending = new Map()
  const h = harness((_wc, file) => new Promise(resolve => pending.set(file, resolve)))
  h.currentPath.value = 'a.php'
  const first = h.loadHistory()
  h.currentPath.value = 'b.php'
  const second = h.loadHistory()
  pending.get('b.php')([{ revision: 42 }]); await second
  pending.get('a.php')([{ revision: 99 }]); await first
  assert.equal(h.logs.value[0].revision, 42)
  assert.equal(h.loadedFile.value, 'b.php')
  for (const file of ['/other/a.php', '../outside.php']) {
    h.currentPath.value = file
    await h.loadHistory()
  }
  assert.equal(h.calls.length, 2)
  assert.equal(h.errors.length, 2)
})
