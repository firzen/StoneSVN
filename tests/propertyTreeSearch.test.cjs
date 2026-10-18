const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const flush = async () => { await vue.nextTick(); await Promise.resolve(); await vue.nextTick() }

function harness() {
  const props = vue.reactive({ workspace: '/wc' })
  const store = vue.reactive({ currentPath: '/wc', statusList: [], operationBusy: false })
  const statusContext = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/propertyTreeStatus.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, statusContext)
  const pending = [], timers = new Map(), cleanups = []
  let timerId = 0
  const originalRows = [{ path: '.', directory: true, depth: 0, type: 'entry', workspace: '/wc' }]
  const mocks = {
    vue: { ...vue, onBeforeUnmount: fn => cleanups.push(fn) },
    'vue-i18n': { useI18n: () => ({ t: (key, params) => params ? `${key}:${Object.values(params).join(' ')}` : key }) },
    '@/composables/useSvnStatus': { getStatusLabelKey: status => status },
    '@/utils/propertyTreeStatus': statusContext.exports,
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/composables/usePropertyTree': { propertyTree: { rows: () => originalRows, open() {}, refresh: async () => {} }, canExpandPropertyEntry: row => row.expandable ?? row.directory },
    '@/utils/propertyDrafts': {},
    '@/api/svn': { workspaceSearch: (workspace, query) => new Promise((resolve, reject) => pending.push({ workspace, query, resolve, reject })) },
  }
  const context = { exports: {}, defineProps: () => props, defineEmits: () => () => {}, defineExpose() {},
    setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id),
    require: name => { assert.ok(name in mocks, name); return mocks[name] },
  }
  const script = fs.readFileSync('src/components/PropertyProjectTree.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const scope = vue.effectScope()
  scope.run(() => vm.runInNewContext(ts.transpileModule(script + '\nexports.state = { searchQuery, rows, searching, searchError, canToggle, rowStatuses, statusTitle };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context))
  return { ...context.exports.state, props, store, pending, originalRows,
    runTimer() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()) },
    stop() { cleanups.forEach(fn => fn()); scope.stop() },
  }
}

test('collapsed directory badges react to status refreshes and distinguish own and descendant changes', async () => {
  const h = harness()
  const directory = { workspace: '/wc', path: 'src', directory: true }
  h.store.statusList = [
    { path: 'src', status_code: 'normal', prop_status: 'modified' },
    { path: 'src\\deep\\added.php', status_code: 'added' },
    { path: 'src/deep/deleted.php', status_code: 'deleted' },
  ]
  await flush()
  assert.equal(h.rowStatuses(directory).join(','), 'modified,added,deleted')
  assert.equal(h.statusTitle(directory, 'added'), 'properties.directoryOwnStatus:M; properties.directoryChildStatuses:A D')
  assert.equal(h.rowStatuses({ ...directory, path: 'src/deep/added.php', directory: false }).join(','), 'added')
  assert.equal(h.rowStatuses({ ...directory, workspace: '/other' }).length, 0)
  h.store.statusList = []
  await flush()
  assert.equal(h.rowStatuses(directory).length, 0)
  assert.equal(h.rows.value, h.originalRows)
  h.stop()
})

test('property filter debounces input, rejects late results and restores the original tree on clear', async () => {
  const h = harness()
  h.searchQuery.value = 'first'; await flush()
  h.searchQuery.value = 'second'; await flush()
  h.runTimer()
  assert.equal(h.pending.length, 1)
  assert.equal(h.pending[0].query, 'second')
  h.searchQuery.value = 'third'; await flush(); h.runTimer()
  h.pending[1].resolve([{ path: 'collapsed/third.txt', directory: false }]); await flush()
  assert.equal(h.rows.value[0].name, 'collapsed/third.txt')
  assert.equal(h.canToggle({ directory: true }), false)
  h.pending[0].resolve([{ path: 'old.txt', directory: false }]); await flush()
  assert.equal(h.rows.value[0].path, 'collapsed/third.txt')
  h.searchQuery.value = ''; await flush()
  assert.equal(h.rows.value, h.originalRows)
  assert.equal(h.searching.value, false)
  assert.equal(h.canToggle({ directory: true }), true)
  h.stop()
})

test('workspace changes and clearing invalidate pending searches; errors leave the filter usable', async () => {
  const h = harness()
  h.searchQuery.value = 'file'; await flush(); h.runTimer()
  h.props.workspace = '/other'; await flush(); h.runTimer()
  h.pending[0].resolve([{ path: 'wrong-workspace.txt' }]); await flush()
  assert.equal(h.rows.value.length, 0)
  h.pending[1].reject(Error('read failed')); await flush()
  assert.match(h.searchError.value, /read failed/)
  assert.equal(h.searching.value, false)
  h.searchQuery.value = 'retry'; await flush(); h.runTimer()
  h.searchQuery.value = ''; await flush()
  h.pending[2].resolve([{ path: 'late.txt' }]); await flush()
  assert.equal(h.rows.value, h.originalRows)
  h.stop()
})
