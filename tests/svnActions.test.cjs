const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')
const flush = async () => { await vue.nextTick(); await Promise.resolve(); await vue.nextTick() }
const detail = () => ({ info: { revision: 3, schedule: 'normal', url: 'file:///old' }, directory: false, editable: true, link_target: null, properties: [] })
function harness(component, api = {}) {
  const props = vue.reactive({ workspace: '/wc', file: 'dir/file.txt', details: detail(), disabled: false, status: { status_code: 'modified', prop_status: 'none', directory: false } })
  const store = vue.reactive({ currentPath: '/wc', recentWorkspaces: ['/wc', '/wc/sub', '/elsewhere'], operationBusy: false, statusIsStale: false,
    statusList: [{ path: 'dir/file.txt', status_code: 'modified', prop_status: 'none' }], setOperationBusy(value) { this.operationBusy = value } })
  const calls = [], events = [], messages = [], drafts = vue.reactive(new Map()), treeState = { expanded: new Set() }
  let refreshes = 0
  const mocks = {
    vue,
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    'element-plus/es/components/message/index': { ElMessage: { error: value => messages.push(['error', value]), success: value => messages.push(['success', value]) } },
    'element-plus/es/components/message-box/index': { ElMessageBox: { prompt: api.prompt || (async () => ({ value: 'new.txt' })), confirm: api.confirm || (async () => {}) } },
    './RevertImpactTree.vue': { default: { name: 'RevertImpactTree' } },
    '@/api/svn': {
      svnRevertPreview: api.preview || (async () => store.statusList.filter(entry => props.file === '.' || entry.path === props.file || entry.path.startsWith(props.file + '/'))),
      svnMove: async (...args) => { calls.push(['move', ...args]); if (api.move) return api.move(...args); return { success: true } },
      svnRevert: async (...args) => { calls.push(['revert', ...args]); if (api.revert) return api.revert(...args); return { success: true } },
      svnResolve: async (...args) => { calls.push(['resolve', ...args]); if (api.resolve) return api.resolve(...args); return { success: true } },
      svnInfo: api.info || (async () => detail().info),
      svnRelocate: async (...args) => { calls.push(['relocate', ...args]); if (api.relocate) return api.relocate(...args); return { success: true } },
    },
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/composables/useWorkspace': { useWorkspace: () => ({ refreshStatusAfterMutation: async () => { refreshes++; return api.refresh !== false } }) },
    '@/composables/usePropertyTree': { propertyTree: { project: () => treeState, select: (...args) => calls.push(['select', ...args]) } },
    '@/utils/propertyDrafts': { propertyDrafts: drafts },
    '@/utils/svnInfoCache': { invalidateSvnInfoMetadata: path => calls.push(['invalidateInfo', path]) },
    '@/utils/workspaceSnapshot': { invalidateWorkspaceSnapshot: path => calls.push(['invalidateSnapshot', path]) },
  }
  const names = {
    SvnTargetOperations: 'canMove, canRevert, hasDraft, moveTarget, revertTarget, validDestination',
    SvnConflictActions: 'canResolve, openDialog, resolveTarget, visible, strategy, busy',
    SvnRelocateAction: 'relocateTarget, validUrl',
  }
  const source = fs.readFileSync(`src/components/${component}.vue`, 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const context = { exports: {}, URL, defineProps: () => props, defineEmits: () => (...args) => events.push(args), require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  const scope = vue.effectScope()
  scope.run(() => vm.runInNewContext(ts.transpileModule(source + `\nexports.actions = { ${names[component]} };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context))
  return { ...context.exports.actions, props, store, calls, events, messages, drafts, treeState, refreshes: () => refreshes, stop: () => scope.stop() }
}

test('rename keeps the parent, move accepts a complete relative destination, and selects the new target', async () => {
  for (const [rename, input, destination] of [[true, 'renamed@file.txt', 'dir/renamed@file.txt'], [false, 'other/moved.txt', 'other/moved.txt']]) {
    const h = harness('SvnTargetOperations', { prompt: async () => ({ value: input }) })
    await h.moveTarget(rename)
    assert.deepEqual(h.calls[0], ['move', '/wc', 'dir/file.txt', destination])
    assert.deepEqual(h.calls[1], ['select', '/wc', destination])
    assert.equal(h.refreshes(), 1)
    assert.ok(h.treeState.expanded.has(rename ? 'dir' : 'other'))
    assert.equal(h.store.operationBusy, false)
    h.stop()
  }
})

test('moving rejects unsafe paths, roots, drafts, conflicts and stale snapshots', async () => {
  const h = harness('SvnTargetOperations')
  for (const path of ['../out', '/absolute', 'C:\\out', '.svn/file', 'a/../b', 'https://server/path']) assert.equal(h.validDestination(path, false), false)
  assert.equal(h.validDestination('a/b', true), false)
  h.props.file = '.'; assert.equal(h.canMove.value, false)
  h.props.file = 'dir'; h.props.details.directory = true
  h.drafts.set(JSON.stringify(['/wc', 'dir/nested/file']), { pending: 'edit' })
  assert.equal(h.canMove.value, false); assert.equal(h.canRevert.value, false)
  h.drafts.clear(); h.store.statusIsStale = true; assert.equal(h.canMove.value, false)
  h.store.statusIsStale = false; h.props.status.status_code = 'conflicted'; assert.equal(h.canMove.value, false)
  h.stop()
})

test('cancelled or changed selections do not move, failures refresh without reporting success', async () => {
  for (const prompt of [async () => { throw 'cancel' }, async () => { h.props.file = 'different'; return { value: 'new' } }]) {
    var h = harness('SvnTargetOperations', { prompt })
    await h.moveTarget(true)
    assert.equal(h.calls.length, 0); assert.equal(h.refreshes(), 0); assert.equal(h.store.operationBusy, false)
    h.stop()
  }
  const failed = harness('SvnTargetOperations', { move: async () => { throw Error('destination exists') } })
  await failed.moveTarget(true)
  assert.equal(failed.refreshes(), 1); assert.equal(failed.store.operationBusy, false)
  assert.equal(failed.messages[0][0], 'error'); assert.match(failed.messages[0][1], /destination exists/)
  assert.equal(failed.calls.length, 1)
  failed.stop()
})

test('directory revert includes descendants and root but ignores untracked-only changes', async () => {
  const h = harness('SvnTargetOperations')
  h.props.file = 'dir'; h.props.details.directory = true
  assert.equal(h.canRevert.value, true)
  await h.revertTarget()
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), ['revert', '/wc', ['dir'], [{ path: 'dir/file.txt', status_code: 'modified', prop_status: 'none' }]])
  h.props.file = '.'; assert.equal(h.canRevert.value, true)
  h.store.statusList = [{ path: 'untracked', status_code: 'unversioned', prop_status: 'none' }]
  assert.equal(h.canRevert.value, false)
  h.stop()
})

test('conflict dialog applies the chosen strategy and prevents duplicate submissions', async () => {
  let finish
  const h = harness('SvnConflictActions', { resolve: () => new Promise(resolve => { finish = resolve }) })
  h.props.status.status_code = 'conflicted'
  h.openDialog(); h.strategy.value = 'theirs-full'
  const pending = h.resolveTarget()
  await h.resolveTarget()
  assert.equal(h.calls.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), ['resolve', '/wc', ['dir/file.txt'], 'theirs-full'])
  finish({ success: true }); await pending
  assert.equal(h.refreshes(), 1); assert.equal(h.visible.value, false); assert.equal(h.store.operationBusy, false)
  h.stop()
})

test('conflict cancellation, changed targets and failed commands cannot falsely report resolution', async () => {
  const h = harness('SvnConflictActions', { resolve: async () => { throw Error('tree conflict') } })
  h.props.status.prop_status = 'conflicted'
  h.openDialog(); h.visible.value = false; await h.resolveTarget(); assert.equal(h.calls.length, 0)
  h.openDialog(); h.props.file = 'other'; await flush(); await h.resolveTarget(); assert.equal(h.calls.length, 0)
  h.openDialog(); await h.resolveTarget()
  assert.equal(h.refreshes(), 1); assert.equal(h.store.operationBusy, false); assert.equal(h.messages[0][0], 'error')
  h.stop()
})

test('relocation invalidates metadata and snapshots of saved child projects and refreshes once', async () => {
  const h = harness('SvnRelocateAction', { prompt: async () => ({ value: 'https://new.example/repo/trunk' }) })
  await h.relocateTarget()
  assert.deepEqual(h.calls[0], ['relocate', '/wc', 'https://new.example/repo/trunk'])
  assert.deepEqual(h.calls.slice(1), [['invalidateInfo', '/wc'], ['invalidateSnapshot', '/wc'], ['invalidateInfo', '/wc/sub'], ['invalidateSnapshot', '/wc/sub']])
  assert.equal(h.refreshes(), 1); assert.equal(h.store.operationBusy, false)
  for (const url of ['not a url', 'javascript:alert(1)', 'https://server/repo#fragment']) assert.equal(h.validUrl(url), false)
  h.stop()
})

test('cancelled relocations do not mutate; rejected relocations still invalidate and refresh', async () => {
  const cancelled = harness('SvnRelocateAction', { prompt: async () => { throw 'cancel' } })
  await cancelled.relocateTarget(); assert.equal(cancelled.calls.length, 0); assert.equal(cancelled.store.operationBusy, false); cancelled.stop()
  const failed = harness('SvnRelocateAction', { prompt: async () => ({ value: 'file:///different' }), relocate: async () => { throw Error('UUID mismatch') } })
  await failed.relocateTarget()
  assert.equal(failed.refreshes(), 1); assert.equal(failed.messages[0][0], 'error'); assert.equal(failed.store.operationBusy, false)
  failed.stop()
})


test('revert confirmation uses the complete SVN preview and passes the reviewed scope back to SVN', async () => {
  const entries = [{ path: 'dir/nested/hidden.txt', status_code: 'modified', prop_status: 'none' }, { path: 'dir', status_code: 'normal', prop_status: 'modified' }]
  let message
  const h = harness('SvnTargetOperations', { preview: async () => entries, confirm: async value => { message = value } })
  h.props.file = 'dir'; h.props.details.directory = true
  await h.revertTarget()
  const tree = message.children[2]
  assert.equal(tree.type.name, 'RevertImpactTree')
  assert.equal(tree.props.root, 'dir')
  assert.deepEqual(tree.props.entries, entries)
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), ['revert', '/wc', ['dir'], entries])
  h.stop()
})

test('failed or empty impact previews never offer a destructive revert', async () => {
  let confirms = 0
  for (const preview of [async () => [], async () => { throw Error('cannot read SVN status') }]) {
    const h = harness('SvnTargetOperations', { preview, confirm: async () => { confirms++ } })
    await h.revertTarget()
    assert.equal(h.calls.length, 0)
    assert.equal(h.store.operationBusy, false)
    h.stop()
  }
  assert.equal(confirms, 0)
})
