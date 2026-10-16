const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')

function harness(entries) {
  const treeContext = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/changeTree.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, treeContext)
  const commits = []
  const store = vue.reactive({ currentPath: '/wc', statusList: entries, commitDrafts: {}, statusIsStale: false,
    operationBusy: false, setOperationBusy(value) { this.operationBusy = value } })
  const mocks = {
    vue: { ...vue, onMounted() {}, onBeforeUnmount() {} },
    'vue-router': { useRouter: () => ({ push() {}, replace() {} }), useRoute: () => ({ query: {} }), onBeforeRouteLeave() {} },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/api/svn': { svnCommit: async (...args) => { commits.push(args); return { success: false, output: 'done' } } },
    '@/composables/useSvnStatus': {},
    '@/composables/useWorkspace': { useWorkspace: () => ({ refreshStatusAfterMutation: async () => {} }) },
    '@/composables/useSettings': { useSettings: () => ({ settings: { gitignoreEnabled: false } }) },
    '@/utils/changeTree': treeContext.exports,
  }
  const script = fs.readFileSync('src/views/CommitView.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const context = { exports: {}, setTimeout() {}, require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  vm.runInNewContext(ts.transpileModule(script + '\nexports.actions = { fullTree, selectedFiles, isChecked, isPartial, toggleSubtree, toggleNode, commitMessage, doCommit };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return { ...context.exports.actions, store, commits }
}
const entry = (path, status_code = 'modified', prop_status = 'none') => ({ path, status_code, prop_status })

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
