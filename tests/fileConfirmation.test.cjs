const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function harness(status = 'modified', path = 'file.ts') {
  const confirmation = deferred(), dialogs = [], operations = [], previews = []
  const file = { path, status_code: status, prop_status: 'none' }
  const store = vue.reactive({ currentPath: '/wc', statusList: [file], error: null, setError(error) { this.error = error } })
  let refreshes = 0, operation = async () => {}, unmount
  const mocks = {
    vue: { ...vue, onMounted() {}, onBeforeUnmount(fn) { unmount = fn } },
    'vue-router': { useRouter: () => ({}) },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/api/svn': {
      svnFilePreview: (...args) => { const request = { args, ...deferred() }; previews.push(request); return request.promise },
      svnRevert: async (...args) => { operations.push({ type: 'revert', args }); await operation() },
      deleteUnversioned: async (...args) => { operations.push({ type: 'delete', args }); await operation() },
    },
    'element-plus/es/components/message/index': {},
    'element-plus/es/components/message-box/index': { ElMessageBox: { confirm: (...args) => { dialogs.push(args); return confirmation.promise } } },
    '@/composables/useSvnStatus': {},
    '@/composables/useWorkspace': { useWorkspace: () => ({ refreshStatusAfterMutation: async () => { refreshes++; return true } }) },
    '@/components/VirtualViewport.vue': {},
    '@/components/DiffViewer.vue': {},
    '@/components/GlassLoading.vue': {},
    '@/utils/clipboard': {},
  }
  const script = fs.readFileSync('src/views/WorkspaceView.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const code = ts.transpileModule(script + '\nexports.actions = { handleFileAction, fileActionLabel, pendingFileAction, selectFile, selectedFile, diffResult, isLoadingDiff, showDiffLoading, workspaceFiles, changedFileCount, filteredFiles, setFilter };', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const context = { exports: {}, setTimeout, clearTimeout, document: { removeEventListener() {} }, require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  vm.runInNewContext(code, context)
  return { ...context.exports.actions, file, store, confirmation, dialogs, operations, previews,
    refreshes: () => refreshes, setOperation: fn => { operation = fn }, unmount: () => unmount() }
}

test('workspace list and counts exclude property-only entries without losing actual changes or property conflicts', () => {
  const h = harness()
  const entries = [
    { path: '.', status_code: 'normal', prop_status: 'modified' },
    { path: '_tmp', status_code: 'normal', prop_status: 'modified' },
    { path: 'unchanged.txt', status_code: 'normal', prop_status: 'none' },
    { path: 'changed.txt', status_code: 'modified', prop_status: 'none' },
    { path: 'new-directory', status_code: 'unversioned', prop_status: 'none' },
    { path: 'conflict', status_code: 'normal', prop_status: 'conflicted' },
  ]
  h.store.statusList = entries
  assert.deepEqual(Array.from(h.filteredFiles.value, file => file.path), ['changed.txt', 'new-directory', 'conflict'])
  assert.equal(h.workspaceFiles.value.length, 3)
  assert.equal(h.changedFileCount.value, 1)
  h.setFilter('modified')
  assert.deepEqual(Array.from(h.filteredFiles.value, file => file.path), ['changed.txt'])
  h.setFilter('added')
  assert.deepEqual(Array.from(h.filteredFiles.value, file => file.path), ['new-directory'])
  h.setFilter('conflicted')
  assert.deepEqual(Array.from(h.filteredFiles.value, file => file.path), ['conflict'])
  assert.equal(h.store.statusList.length, 6)
  h.store.statusList = entries.slice(0, 3)
  h.setFilter('all')
  assert.equal(h.workspaceFiles.value.length, 0)
  assert.equal(h.changedFileCount.value, 0)
  assert.equal(h.filteredFiles.value.length, 0)
  h.unmount()
})

test('rapid preview switching runs only the active and latest requests, with no stale result', async () => {
  const h = harness()
  const first = h.selectFile({ path: 'a.ts' })
  await h.selectFile({ path: 'b.ts' })
  await h.selectFile({ path: 'c.ts' })
  assert.equal(h.previews.length, 1)
  assert.equal(h.selectedFile.value, 'c.ts')
  assert.equal(h.showDiffLoading.value, false)
  h.previews[0].resolve({ path: 'a.ts', diff: '+old' })
  await new Promise(setImmediate)
  assert.equal(h.previews.length, 2)
  assert.equal(h.previews[1].args[1], 'c.ts')
  assert.equal(h.diffResult.value, null)
  h.previews[1].resolve({ path: 'c.ts', diff: '+latest' })
  await first
  assert.equal(h.diffResult.value.path, 'c.ts')
  assert.equal(h.isLoadingDiff.value, false)
  assert.equal(h.showDiffLoading.value, false)
  h.unmount()
})

test('reselecting a loading preview is coalesced; failures and displayed files can refresh', async () => {
  const h = harness()
  const first = h.selectFile(h.file)
  await h.selectFile(h.file)
  assert.equal(h.previews.length, 1)
  h.previews[0].reject(new Error('read failed'))
  await first
  const retry = h.selectFile(h.file)
  assert.equal(h.previews.length, 2)
  h.previews[1].resolve({ path: h.file.path, diff: '+text' })
  await retry
  const refresh = h.selectFile(h.file)
  assert.equal(h.previews.length, 3)
  h.previews[2].resolve({ path: h.file.path, diff: '+edited externally' })
  await refresh
  assert.equal(h.diffResult.value.diff, '+edited externally')
  h.unmount()
})

test('workspace changes discard queued previews and late active results', async () => {
  const h = harness()
  const first = h.selectFile({ path: 'a.ts' })
  await h.selectFile({ path: 'b.ts' })
  h.store.currentPath = '/other'
  await h.selectFile({ path: 'new.ts' })
  h.previews[0].resolve({ path: 'a.ts', diff: '+old' })
  await new Promise(setImmediate)
  assert.equal(h.previews.length, 2)
  assert.deepEqual(h.previews[1].args, ['/other', 'new.ts'])
  h.previews[1].resolve({ path: 'new.ts', diff: '+new' })
  await first
  assert.equal(h.diffResult.value.path, 'new.ts')
  h.unmount()
})

test('revert waits for explicit confirmation and displays the target as escaped text', async () => {
  const h = harness('modified', '<img src=x onerror=alert(1)>.ts')
  const pending = h.handleFileAction(h.file)
  assert.equal(h.operations.length, 0)
  assert.equal(h.dialogs.length, 1)
  const [message, title, options] = h.dialogs[0]
  assert.equal(title, 'common.revert')
  assert.equal(message.children[0].children, 'workspace.revertFileConfirm')
  assert.equal(message.children[1].children, '/wc/<img src=x onerror=alert(1)>.ts')
  assert.equal(message.children[1].props.innerHTML, undefined)
  assert.equal(options.closeOnClickModal, false)
  assert.equal(options.autofocus, false)
  h.confirmation.resolve('confirm')
  await pending
  assert.equal(h.operations[0].type, 'revert')
  assert.equal(h.operations[0].args[0], '/wc')
  assert.equal(Array.from(h.operations[0].args[1])[0], h.file.path)
  assert.equal(h.refreshes(), 1)
  assert.equal(h.pendingFileAction.value, null)
})

test('unversioned targets use Delete labels and the permanent deletion warning', async () => {
  const h = harness('unversioned', 'new-directory')
  assert.equal(h.fileActionLabel(h.file), 'common.delete')
  const pending = h.handleFileAction(h.file)
  assert.equal(h.dialogs[0][0].children[0].children, 'workspace.deleteUnversionedConfirm')
  assert.equal(h.dialogs[0][2].confirmButtonText, 'common.delete')
  h.confirmation.resolve('confirm')
  await pending
  assert.equal(h.operations[0].type, 'delete')
})

test('cancel and close leave files and error state unchanged', async () => {
  for (const action of ['cancel', 'close']) {
    const h = harness()
    const pending = h.handleFileAction(h.file)
    h.confirmation.reject(action)
    await pending
    assert.equal(h.operations.length, 0)
    assert.equal(h.refreshes(), 0)
    assert.equal(h.store.error, null)
    assert.equal(h.pendingFileAction.value, null)
  }
})

test('a workspace switch, even away and back, invalidates the confirmation', async () => {
  const h = harness()
  const pending = h.handleFileAction(h.file)
  h.store.currentPath = '/another'
  h.store.currentPath = '/wc'
  h.confirmation.resolve('confirm')
  await pending
  assert.equal(h.operations.length, 0)
})

test('removed or changed SVN status requires a new confirmation', async () => {
  for (const change of [h => { h.store.statusList = [] }, h => { h.store.statusList[0].status_code = 'added' }]) {
    const h = harness('unversioned')
    const pending = h.handleFileAction(h.file)
    change(h)
    h.confirmation.resolve('confirm')
    await pending
    assert.equal(h.operations.length, 0)
  }
})

test('duplicate clicks cannot open multiple dialogs or execute the operation twice', async () => {
  const h = harness(), execution = deferred()
  h.setOperation(() => execution.promise)
  const first = h.handleFileAction(h.file)
  await h.handleFileAction(h.file)
  assert.equal(h.dialogs.length, 1)
  h.confirmation.resolve('confirm')
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await h.handleFileAction(h.file)
  assert.equal(h.operations.length, 1)
  execution.resolve()
  await first
  assert.equal(h.pendingFileAction.value, null)
})

test('operation failures retain their error and unlock file actions', async () => {
  const h = harness()
  h.setOperation(async () => { throw new Error('SVN failed') })
  const pending = h.handleFileAction(h.file)
  h.confirmation.resolve('confirm')
  await pending
  assert.equal(h.store.error, 'Error: SVN failed')
  assert.equal(h.refreshes(), 0)
  assert.equal(h.pendingFileAction.value, null)
})

test('unmounting the view invalidates a pending confirmation', async () => {
  const h = harness()
  const pending = h.handleFileAction(h.file)
  h.unmount()
  h.confirmation.resolve('confirm')
  await pending
  assert.equal(h.operations.length, 0)
})


test('unverified cached status cannot start or confirm a destructive file action', async () => {
  const h = harness()
  h.store.statusIsStale = true
  await h.handleFileAction(h.file)
  assert.equal(h.dialogs.length, 0)
  h.store.statusIsStale = false
  const pending = h.handleFileAction(h.file)
  h.store.statusIsStale = true
  h.confirmation.resolve('confirm')
  await pending
  assert.equal(h.operations.length, 0)
})
