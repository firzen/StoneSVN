const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')

function deferred() {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}

function harness({ logs = [], remoteRevision = 2, incomingRequest = async () => logs, updated = [], warning = null } = {}) {
  const update = deferred(), refresh = deferred(), calls = [], lifecycle = {}, timers = new Set()
  const store = vue.reactive({
    currentPath: '/wc', svnInfo: { revision: 1, repository_root: 'https://svn.example.com/repo' }, statusList: [],
    setError(error) { this.error = error },
    setOperationBusy(value) { this.operationBusy = value },
  })
  const mocks = {
    vue: {
      ...vue, watch() {}, onUnmounted() {},
      onActivated(fn) { lifecycle.activate = fn },
      onDeactivated(fn) { lifecycle.deactivate = fn },
    },
    'vue-router': { useRouter: () => ({ push(route) { calls.push(route) } }) },
    'vue-i18n': { useI18n: () => ({ t: key => key, locale: vue.ref('en-US') }) },
    'element-plus/es/components/message/index': { ElMessage: { success() {}, error() {}, warning() { calls.push('warning') } } },
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/composables/useWorkspace': { useWorkspace: () => ({
      refreshStatusIfStale: async () => false,
      refreshStatusAfterMutation: async () => {
        calls.push('refresh')
        await refresh.promise
        store.svnInfo = { ...store.svnInfo, revision: 2 }
        store.statusList = [{ path: 'conflict.txt', status_code: 'conflicted' }]
        return true
      },
    }) },
    '@/composables/useSettings': { useSettings: () => ({ settings: {} }) },
    '@/composables/useSvnStatus': {},
    '@/api/svn': {
      svnUpdate: async () => { calls.push('update'); await update.promise; return { files: updated, warning } },
      svnIncomingState: async () => { calls.push('incoming'); return { revision: remoteRevision, logs: await incomingRequest() } },
    },
  }
  const script = fs.readFileSync('src/views/UpdateView.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const code = ts.transpileModule(script + '\nexports.actions = { doUpdate, updating, loadUpdateState, incomingLogs, checkState, incomingMessage, updatedFiles, updateCompleted, viewUpdatedDiff, activeTab, updateEndRevision, hasUpdateConflicts, visibleTabs, selectedIncoming, selectIncomingRevision, incomingRows, viewIncomingDiff };', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const context = {
    exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name] },
    window: {
      setInterval(fn) { timers.add(fn); return fn },
      clearInterval(fn) { timers.delete(fn) },
    },
  }
  vm.runInNewContext(code, context)
  return { ...context.exports.actions, update, refresh, calls, store, lifecycle, timers }
}

test('leaving during an update still refreshes the shared revision and conflict list', async () => {
  const h = harness()
  h.lifecycle.activate()
  const pending = h.doUpdate()
  assert.equal(h.store.operationBusy, true)
  h.lifecycle.deactivate()
  assert.equal(h.timers.size, 0)
  h.update.resolve()
  h.refresh.resolve()
  await pending
  assert.deepEqual(h.calls, ['update', 'refresh'])
  assert.equal(h.store.svnInfo.revision, 2)
  assert.equal(h.store.statusList[0].status_code, 'conflicted')
  assert.equal(h.updating.value, false)
  assert.equal(h.store.operationBusy, false)
})

test('deactivation during the post-update refresh suppresses remote requests', async () => {
  const h = harness()
  h.lifecycle.activate()
  const pending = h.doUpdate()
  h.update.resolve()
  for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.deepEqual(h.calls, ['update', 'refresh'])
  h.lifecycle.deactivate()
  h.refresh.resolve()
  await pending
  assert.deepEqual(h.calls, ['update', 'refresh'])
  assert.equal(h.store.svnInfo.revision, 2)
})

test('an active update refreshes local state once before querying the remote revision', async () => {
  const h = harness()
  h.lifecycle.activate()
  const pending = h.doUpdate()
  h.update.resolve()
  h.refresh.resolve()
  await pending
  assert.deepEqual(h.calls, ['update', 'refresh', 'incoming'])
})

test('completion in a different workspace does not refresh that workspace', async () => {
  const h = harness()
  h.lifecycle.activate()
  const pending = h.doUpdate()
  h.store.currentPath = '/other'
  h.update.resolve()
  await pending
  assert.deepEqual(h.calls, ['update'])
})


test('a lower root revision does not create incoming commits when SVN reports no remote changes', async () => {
  const h = harness({ remoteRevision: 4 })
  h.lifecycle.activate()
  h.refresh.resolve()
  await h.loadUpdateState(true)
  assert.equal(h.store.svnInfo.revision, 2)
  assert.equal(h.incomingLogs.value.length, 0)
  assert.deepEqual(h.calls, ['refresh', 'incoming'])
})

test('incoming file changes are shown even when the root revision equals HEAD', async () => {
  const h = harness({ logs: [{ revision: 1, changed_paths: [{ path: '/file', action: 'M' }] }] })
  h.lifecycle.activate()
  h.refresh.resolve()
  await h.loadUpdateState(true)
  assert.equal(h.store.svnInfo.revision, 2)
  assert.equal(h.incomingLogs.value.length, 1)
  assert.equal(h.incomingLogs.value[0].revision, 1)
})


test('SSL failure leaves update availability unknown and a successful retry restores it', async () => {
  let fail = true
  const h = harness({ incomingRequest: async () => {
    if (fail) throw new Error('svn: E120171: SSL communication failed')
    return []
  } })
  h.lifecycle.activate()
  h.refresh.resolve()
  await h.loadUpdateState(true)
  assert.equal(h.checkState.value, 'failed')
  assert.equal(h.incomingMessage.value, 'update.checkFailed')
  assert.match(h.store.error, /E120171/)
  fail = false
  await h.loadUpdateState(true)
  assert.equal(h.checkState.value, 'ready')
  assert.equal(h.incomingMessage.value, 'update.noIncoming')
  assert.equal(h.store.error, null)
})

test('a failed recheck clears stale incoming commits instead of presenting a successful result', async () => {
  let fail = false
  const h = harness({ incomingRequest: async () => {
    if (fail) throw new Error('connection failed')
    return [{ revision: 3, changed_paths: [] }]
  } })
  assert.equal(h.incomingMessage.value, 'update.notChecked')
  h.lifecycle.activate()
  h.refresh.resolve()
  await h.loadUpdateState(true)
  assert.equal(h.incomingLogs.value.length, 1)
  fail = true
  await h.loadUpdateState(true)
  assert.equal(h.checkState.value, 'failed')
  assert.equal(h.incomingLogs.value.length, 0)
  assert.equal(h.incomingMessage.value, 'update.checkFailed')
})


test('completed update retains its files after incoming commits disappear and opens the update revisions', async () => {
  const file = { path: '中文 @.txt', action: 'M', old_revision: 2, new_revision: 8, target: 'file:///repo/name@8' }
  const h = harness({ updated: [file] })
  h.lifecycle.activate()
  const pending = h.doUpdate()
  h.update.resolve()
  h.refresh.resolve()
  await pending
  assert.equal(h.incomingLogs.value.length, 0)
  assert.equal(h.updateCompleted.value, true)
  assert.equal(h.updatedFiles.value[0].path, file.path)
  await h.loadUpdateState(true)
  assert.equal(h.updatedFiles.value.length, 1)
  h.viewUpdatedDiff(h.updatedFiles.value[0])
  const route = h.calls.at(-1)
  assert.equal(route.name, 'diff')
  assert.equal(route.query.oldRev, '2')
  assert.equal(route.query.newRev, '8')
  assert.equal(route.query.target, file.target)
  assert.equal(route.query.path, file.path)
})


test('slow remote history does not hold a completed update busy or repeat the local scan', async () => {
  const remote = deferred()
  const h = harness({ incomingRequest: () => remote.promise })
  h.lifecycle.activate()
  const pending = h.doUpdate()
  h.update.resolve()
  h.refresh.resolve()
  await pending
  assert.equal(h.updating.value, false)
  assert.equal(h.store.operationBusy, false)
  assert.equal(h.updateCompleted.value, true)
  assert.equal(h.checkState.value, 'checking')
  assert.deepEqual(h.calls, ['update', 'refresh', 'incoming'])
  remote.resolve([])
  for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(h.checkState.value, 'ready')
})


test('completion selects the result tab and warns about conflicts or unavailable details', async () => {
  for (const options of [{ updated: [{ path: 'conflict.txt', action: 'C' }] }, { warning: 'metadata unavailable' }]) {
    const h = harness(options)
    h.lifecycle.activate()
    const pending = h.doUpdate()
    h.update.resolve()
    h.refresh.resolve()
    await pending
    assert.equal(h.activeTab.value, 'result')
    assert.equal(h.updateEndRevision.value, 2)
    assert.ok(h.calls.includes('warning'))
    assert.equal(h.hasUpdateConflicts.value, !!options.updated)
  }
})


test('incoming versions select their own file list and fall back when the selected revision disappears', async () => {
  const logs = [
    { revision: 9, changed_paths: [{ path: '/trunk/new.txt', action: 'A' }] },
    { revision: 8, changed_paths: [{ path: '/trunk/old.txt', action: 'D' }] },
  ]
  const h = harness({ logs })
  h.lifecycle.activate()
  h.refresh.resolve()
  await h.loadUpdateState(true)
  assert.equal(h.visibleTabs.value.length, 1)
  assert.equal(h.visibleTabs.value[0].key, 'incoming')
  assert.equal(h.selectedIncoming.value.revision, 9)
  assert.equal(h.incomingRows.value[0].status, 'added')
  h.selectIncomingRevision(h.incomingLogs.value[1])
  assert.equal(h.selectedIncoming.value.revision, 8)
  assert.equal(h.incomingRows.value[0].path, '/trunk/old.txt')
  assert.equal(h.incomingRows.value[0].status, 'deleted')
  h.viewIncomingDiff(h.incomingRows.value[0])
  assert.equal(h.calls.at(-1).query.path, 'https://svn.example.com/repo/trunk/old.txt@7')
  assert.equal(h.calls.at(-1).query.revision, '8')
  h.incomingLogs.value = [logs[0]]
  assert.equal(h.selectedIncoming.value.revision, 9)
  h.incomingLogs.value = []
  assert.equal(h.selectedIncoming.value, null)
  assert.equal(h.incomingRows.value.length, 0)
})
