const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')
const pinia = require('pinia')

function compile(file, mocks = {}, globals = {}) {
  const context = { exports: {}, require: key => { assert.ok(key in mocks, key); return mocks[key] }, ...globals }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context)
  return context.exports
}
const snapshots = compile('src/utils/statusSnapshot.ts')
const file = { path: 'src/file.php', status: 'M', status_code: 'modified', prop_status: 'none', locked: false, history: false, switched: false }

test('status equality includes all SVN flags, paths and ordering', () => {
  assert.equal(snapshots.sameStatusSnapshot([file], [{ ...file }]), true)
  assert.equal(snapshots.sameStatusSnapshot([], [file]), false)
  for (const [field, value] of Object.entries({ path: 'other.php', status: 'A', status_code: 'added', prop_status: 'modified', locked: true, history: true, switched: true })) {
    assert.equal(snapshots.sameStatusSnapshot([file], [{ ...file, [field]: value }]), false, field)
  }
  const second = { ...file, path: 'src/second.php' }
  assert.equal(snapshots.sameStatusSnapshot([file, second], [second, file]), false)
})

test('unchanged IPC snapshots do not invalidate cached views, actual changes still notify', () => {
  pinia.setActivePinia(pinia.createPinia())
  const { useWorkspaceStore } = compile('src/stores/workspace.ts', {
    vue, pinia,
    '@/utils/workspaceSnapshot': { invalidateWorkspaceSnapshot() {} },
    '@/utils/statusSnapshot': snapshots,
  }, { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } })
  const store = useWorkspaceStore()
  let renders = 0
  const stop = vue.watch(() => store.statusList, () => { renders++ }, { flush: 'sync' })
  store.setStatusList([{ ...file }])
  const first = store.statusList
  store.setStatusList([{ ...file }])
  assert.equal(store.statusList, first)
  assert.equal(renders, 1)
  store.setStatusList([{ ...file, prop_status: 'modified' }])
  assert.equal(renders, 2)
  assert.equal(store.statusList[0].prop_status, 'modified')
  assert.equal(store.changedCount, 1)
  store.clearWorkspace()
  assert.equal(renders, 3)
  assert.equal(store.statusList.length, 0)
  stop()
  store.$dispose()
})
