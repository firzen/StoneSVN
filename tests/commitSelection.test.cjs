const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')

function harness(entries, options = {}) {
  const treeContext = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/changeTree.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, treeContext)
  const commits = []
  const routes = [], reverts = [], previews = [], confirmations = []
  let refreshes = 0
  const store = vue.reactive({ currentPath: '/wc', statusList: entries, commitDrafts: {}, statusIsStale: false,
    operationBusy: false, setOperationBusy(value) { this.operationBusy = value } })
  const mocks = {
    vue: { ...vue, getCurrentInstance() {}, onMounted() {}, onBeforeUnmount() {} },
    'vue-router': { useRouter: () => ({ push(route) { routes.push(route) }, replace() {} }), useRoute: () => ({ query: {} }), onBeforeRouteLeave() {} },
    'element-plus/es/components/message-box/index': { ElMessageBox: { confirm: async (...args) => {
      confirmations.push(args)
      if (options.cancel) throw 'cancel'
    } } },
    '@/components/RevertImpactTree.vue': { default: { render() {} } },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/api/svn': {
      svnCommit: async (...args) => { commits.push(args); return { success: false, output: 'done' } },
      svnRevertPreview: async (...args) => { previews.push(args); return entries },
      svnRevert: async (...args) => { reverts.push(args); return { success: true, output: 'reverted' } },
    },
    '@/composables/useSvnStatus': {},
    '@/composables/useWorkspace': { useWorkspace: () => ({ refreshStatusAfterMutation: async () => { refreshes++ } }) },
    '@/composables/useSettings': { useSettings: () => ({ settings: { gitignoreEnabled: false } }) },
    '@/utils/changeTree': treeContext.exports,
  }
  const script = fs.readFileSync('src/views/CommitView.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const context = { exports: {}, Element: class {}, sessionStorage: { setItem() {} }, setTimeout() {}, require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  vm.runInNewContext(ts.transpileModule(script + '\nexports.actions = { fullTree, selectedFiles, isChecked, isPartial, toggleSubtree, toggleNode, toggleSelection, collapsedPaths, flatRows, searchQuery, commitMessage, doCommit, revertFile, viewBlame, handleRowDoubleClick, loading };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return { ...context.exports.actions, store, commits, routes, reverts, previews, confirmations, refreshes: () => refreshes }
}
const entry = (path, status_code = 'modified', prop_status = 'none') => ({ path, status_code, prop_status })

test('revert previews and confirms the target, then refreshes; cancellation and unversioned files do not mutate', async () => {
  const file = entry('a.txt')
  const h = harness([file])
  await h.revertFile(file)
  assert.equal(h.confirmations.length, 1)
  assert.deepEqual(Array.from(h.previews[0]), ['/wc', 'a.txt'])
  assert.equal(h.reverts[0][0], '/wc')
  assert.deepEqual(Array.from(h.reverts[0][1]), ['a.txt'])
  assert.equal(h.reverts[0][2][0], file)
  assert.equal(h.refreshes(), 1)
  assert.equal(h.store.operationBusy, false)
  assert.equal(h.loading.value, false)
  const cancelled = harness([file], { cancel: true })
  await cancelled.revertFile(file)
  assert.equal(cancelled.reverts.length, 0)
  assert.equal(cancelled.store.operationBusy, false)
  const unversioned = harness([entry('new.txt', 'unversioned')])
  await unversioned.revertFile(unversioned.store.statusList[0])
  assert.equal(unversioned.previews.length, 0)
})

test('double-click opens file diff and blame opens history, excluding directory and unversioned history', () => {
  const h = harness([entry('a.txt'), entry('dir/b.txt'), entry('new.txt', 'unversioned')])
  const node = path => h.flatRows.value.find(row => row.node.path === path).node
  h.handleRowDoubleClick({ target: null }, node('a.txt'))
  assert.equal(h.routes[0].name, 'diff')
  assert.equal(h.routes[0].query.path, 'a.txt')
  h.handleRowDoubleClick({ target: null }, node('dir'))
  assert.equal(h.routes.length, 1)
  h.viewBlame(node('a.txt'))
  assert.equal(h.routes[1].name, 'blame')
  assert.equal(h.routes[1].query.path, 'a.txt')
  h.viewBlame(node('new.txt'))
  h.viewBlame(node('dir'))
  h.store.setOperationBusy(true)
  h.handleRowDoubleClick({ target: null }, node('a.txt'))
  assert.equal(h.routes.length, 2)
})

test('a directory checkbox changes only its own selection and preserves child selections', () => {
  const h = harness([entry('dir', 'normal', 'modified'), entry('dir/a.txt'), entry('dir/nested/b.txt'), entry('other.txt')])
  const directory = h.fullTree.value.find(node => node.path === 'dir')
  h.selectedFiles.value = ['dir/a.txt', 'other.txt']
  h.toggleNode(directory, true)
  assert.deepEqual(Array.from(h.selectedFiles.value).sort(), ['dir', 'dir/a.txt', 'other.txt'])
  assert.equal(h.isChecked(directory), true)
  assert.equal(h.isPartial(directory), false)
  h.toggleNode(directory, false)
  assert.deepEqual(Array.from(h.selectedFiles.value).sort(), ['dir/a.txt', 'other.txt'])
  assert.equal(h.isChecked(directory), false)
  h.store.statusIsStale = true
  h.toggleNode(directory, true)
  assert.equal(h.isChecked(directory), false)
})

test('checking root or newly added directories submits only the directory target', async () => {
  for (const [path, status, props] of [['.', 'normal', 'modified'], ['new', 'added', 'none']]) {
    const child = path === '.' ? 'child.txt' : 'new/child.txt'
    const h = harness([entry(path, status, props), entry(child, 'added')])
    const directory = h.fullTree.value[0]
    h.toggleNode(directory, true)
    assert.deepEqual(Array.from(h.selectedFiles.value), [path])
    h.commitMessage.value = 'directory only'
    await h.doCommit()
    assert.equal(h.commits.length, 1)
    assert.deepEqual(Array.from(h.commits[0][2]), [path])
    assert.equal(h.store.operationBusy, false)
  }
})

test('include children explicitly selects descendants; synthetic groups never become targets', () => {
  const h = harness([entry('dir', 'normal', 'modified'), entry('dir/a.txt'), entry('dir/b.txt')])
  const directory = h.fullTree.value[0]
  h.toggleSubtree(directory, true)
  assert.deepEqual(Array.from(h.selectedFiles.value).sort(), ['dir', 'dir/a.txt', 'dir/b.txt'])
  h.toggleSubtree(directory, false)
  assert.equal(h.selectedFiles.value.length, 0)
  const grouped = harness([entry('group/a.txt'), entry('group/b.txt')])
  grouped.toggleNode(grouped.fullTree.value[0], true)
  assert.deepEqual(Array.from(grouped.selectedFiles.value).sort(), ['group/a.txt', 'group/b.txt'])
})


test('shift ranges select and deselect in both directions while retaining selections outside the range', () => {
  const h = harness(['a', 'b', 'c', 'd', 'e'].map(path => entry(path)))
  const node = path => h.flatRows.value.find(row => row.node.path === path).node
  h.selectedFiles.value = ['e']
  h.toggleSelection(node('b'), true)
  h.toggleSelection(node('d'), true, true)
  assert.deepEqual([...h.selectedFiles.value].sort(), ['b', 'c', 'd', 'e'])
  h.toggleSelection(node('c'), false, true)
  assert.deepEqual([...h.selectedFiles.value].sort(), ['d', 'e'])
  h.toggleSelection(node('d'), false)
  h.toggleSelection(node('b'), false, true)
  assert.deepEqual([...h.selectedFiles.value], ['e'])
})

test('shift selection spans virtual offscreen rows and skips collapsed or filtered descendants', async () => {
  const entries = [entry('group/visible'), entry('group/hidden'), ...Array.from({ length: 200 }, (_, i) => entry(`file-${String(i).padStart(3, '0')}`))]
  const h = harness(entries)
  const node = path => h.flatRows.value.find(row => row.node.path === path).node
  h.collapsedPaths.value = new Set(['group'])
  h.toggleSelection(node('group'), false)
  h.toggleSelection(node('file-199'), true, true)
  assert.equal(h.selectedFiles.value.length, 200)
  assert.ok(!h.selectedFiles.value.includes('group/hidden'))
  h.selectedFiles.value = ['group/hidden']
  h.searchQuery.value = 'file-'
  await vue.nextTick()
  h.toggleSelection(node('file-000'), true)
  h.toggleSelection(node('file-199'), true, true)
  assert.equal(h.selectedFiles.value.length, 201)
  assert.ok(h.selectedFiles.value.includes('group/hidden'))
})

test('changing filters or hiding the anchor resets a shift range; stale status blocks changes', async () => {
  const h = harness([entry('folder/a'), entry('folder/b'), entry('folder/c'), entry('other')])
  const node = path => h.flatRows.value.find(row => row.node.path === path).node
  h.toggleSelection(node('folder/a'), true)
  h.collapsedPaths.value = new Set(['folder'])
  h.toggleSelection(node('other'), true, true)
  assert.deepEqual([...h.selectedFiles.value].sort(), ['folder/a', 'other'])
  h.collapsedPaths.value = new Set()
  h.toggleSelection(node('folder/a'), true)
  h.searchQuery.value = 'folder'
  await vue.nextTick()
  h.toggleSelection(node('folder/c'), true, true)
  assert.deepEqual([...h.selectedFiles.value].sort(), ['folder/a', 'folder/c', 'other'])
  h.store.statusIsStale = true
  h.toggleSelection(node('folder/a'), false, true)
  assert.equal(h.selectedFiles.value.length, 3)
})
