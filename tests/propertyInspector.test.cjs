const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const flush = async () => { await vue.nextTick(); await Promise.resolve(); await vue.nextTick() }
const detail = (properties = []) => ({ editable: true, directory: false, link_target: null, properties, info: {}, size: 10 })
const property = (name, value) => ({ name, value, binary: false })

function harness(api = {}) {
  const props = vue.reactive({ workspace: '/wc', file: 'a.txt', disabled: false })
  const store = vue.reactive({ currentPath: '/wc', operationBusy: false, statusIsStale: false, setOperationBusy(value) { this.operationBusy = value } })
  const calls = [], events = []
  let refreshes = 0
  const mocks = {
    vue: { ...vue, onBeforeUnmount() {} },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    'element-plus/es/components/message-box/index': { ElMessageBox: { confirm: api.confirm || (async () => {}), prompt: api.prompt || (async () => ({ value: '7' })) } },
    'element-plus/es/components/message/index': { ElMessage: { success() {}, error() {} } },
    '@tauri-apps/plugin-dialog': { save: api.destination || (async () => '/exports/new') },
    '@/api/svn': {
      svnExport: async (...args) => { calls.push(['export', ...args]); if (api.export) await api.export(...args); return { success: true } },
      svnPropertyDetails: api.read || (async () => detail([property('test:value', 'original')])),
      svnDelete: async (...args) => { calls.push(['delete', ...args]); if (api.remove) await api.remove(...args); return { success: true } },
      deleteUnversioned: async (...args) => { calls.push(['deleteUnversioned', ...args]); return { success: true } },
      svnRestoreFileRevision: async (...args) => { calls.push(['restore', ...args]); if (api.restore) await api.restore(...args); return { success: true } },
      svnSetProperty: async (...args) => { calls.push(args); if (api.write) await api.write(...args) },
    },
    '@/composables/useSvnStatus': {},
    '@/utils/propertyDrafts': { propertyDrafts: vue.reactive(new Map()) },
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/composables/useWorkspace': { useWorkspace: () => ({ refreshStatusAfterMutation: async () => { refreshes++; return true } }) },
  }
  const source = fs.readFileSync('src/components/SvnPropertyInspector.vue', 'utf8')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const context = { exports: {}, defineExpose() {}, defineProps: () => props, defineEmits: () => (...args) => events.push(args), require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  const scope = vue.effectScope()
  scope.run(() => vm.runInNewContext(ts.transpileModule(script + '\nexports.actions = { details, values, original, dirty, fetching, saving, error, save, setValue, resetValues, load, canExport, exportTarget, exporting, canBlame, openBlame, canDelete, canRestore, deleteTarget, restoreTarget };', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context))
  return { ...context.exports.actions, props, store, calls, events, refreshes: () => refreshes, stop: () => scope.stop() }
}

test('late property reads cannot replace the selected file; pending edits survive row changes', async () => {
  const pending = new Map()
  const h = harness({ read: (_wc, file) => new Promise(resolve => pending.set(file, resolve)) })
  h.props.file = 'b.txt'; await flush()
  pending.get('b.txt')(detail([property('test:value', 'B')])); await flush()
  pending.get('a.txt')(detail([property('test:value', 'A')])); await flush()
  assert.equal(h.values.value['test:value'], 'B')
  h.values.value['test:value'] = 'pending B'; await flush()
  h.props.file = 'c.txt'; await flush()
  pending.get('c.txt')(detail([])); await flush()
  assert.equal(h.dirty.value, false)
  assert.equal(h.events.at(-1)[1], true, 'another inspected file still has pending edits')
  h.props.file = 'b.txt'; await flush()
  pending.get('b.txt')(detail([property('test:value', 'B')])); await flush()
  assert.equal(h.values.value['test:value'], 'pending B')
  assert.equal(h.dirty.value, true)
  h.stop()
})

test('a partial write refreshes status, releases the busy lock and keeps remaining edits', async () => {
  const h = harness({ write: async (_wc, _file, name) => { if (name === 'test:fail') throw new Error('failed property') } })
  await flush()
  delete h.values.value['test:value']
  h.values.value['test:empty'] = ''
  h.values.value['test:fail'] = 'pending'
  await flush(); await h.save(); await flush()
  assert.deepEqual(h.calls.map(args => Array.from(args)), [
    ['/wc', 'a.txt', 'test:value', null], ['/wc', 'a.txt', 'test:empty', ''], ['/wc', 'a.txt', 'test:fail', 'pending'],
  ])
  assert.equal(h.refreshes(), 1)
  assert.equal(h.store.operationBusy, false)
  assert.equal(h.saving.value, false)
  assert.equal(h.dirty.value, true)
  assert.match(h.error.value, /failed property/)
  assert.equal(h.original.value['test:empty'], '')
  assert.equal(h.values.value['test:fail'], 'pending')
  h.stop()
})


test('blame opens the inspected versioned file and blocks directories, unversioned files and busy reads', async () => {
  const h = harness({ read: async () => ({ ...detail(), info: { revision: 42 } }) })
  h.openBlame()
  assert.equal(h.events.some(event => event[0] === 'blame'), false)
  await flush()
  h.setValue('test:draft', 'pending')
  h.openBlame()
  assert.deepEqual(Array.from(h.events.at(-1)), ['blame', 'a.txt'])
  assert.equal(h.values.value['test:draft'], 'pending')
  for (const change of [
    () => { h.details.value.directory = true },
    () => { h.details.value.info = null },
    () => { h.details.value.info.revision = 0 },
    () => { h.props.disabled = true },
    () => { h.store.operationBusy = true },
    () => { h.fetching.value = true },
    () => { h.saving.value = true },
  ]) {
    h.details.value = { ...detail(), info: { revision: 42 } }
    h.props.disabled = false; h.store.operationBusy = false; h.fetching.value = false; h.saving.value = false
    change()
    const before = h.events.length
    h.openBlame()
    assert.equal(h.canBlame.value, false)
    assert.equal(h.events.length, before)
  }
  h.stop()
})


test('target actions capture the selected path, distinguish unversioned deletion and refresh status', async () => {
  const h = harness({ read: async () => ({ ...detail(), info: { revision: 42, schedule: 'normal' } }) })
  await flush()
  await h.restoreTarget()
  assert.deepEqual(h.calls[0], ['restore', '/wc', 'a.txt', 7])
  assert.equal(h.refreshes(), 1)
  assert.equal(h.store.operationBusy, false)
  assert.equal(h.saving.value, false)
  await h.deleteTarget()
  assert.deepEqual(h.calls[1].slice(0, 2), ['delete', '/wc'])
  assert.deepEqual(Array.from(h.calls[1][2]), ['a.txt'])
  assert.ok(h.events.some(event => event[0] === 'mutated' && event[1] === 'delete'))
  h.stop()
  const loose = harness({ read: async () => ({ ...detail(), info: null }) })
  await flush(); await loose.deleteTarget()
  assert.equal(loose.calls[0][0], 'deleteUnversioned')
  assert.equal(loose.canRestore.value, false)
  loose.stop()
})

test('cancelled dialogs, root selections, drafts and stale status never mutate files', async () => {
  const h = harness({ read: async () => ({ ...detail(), info: { revision: 42, schedule: 'normal' } }), prompt: async () => { throw 'cancel' }, confirm: async () => { throw 'close' } })
  await flush()
  await h.restoreTarget(); await h.deleteTarget()
  assert.equal(h.calls.length, 0)
  assert.equal(h.refreshes(), 0)
  assert.equal(h.store.operationBusy, false)
  assert.equal(h.error.value, '')
  h.props.file = '.'; await flush()
  assert.equal(h.canDelete.value, false)
  h.props.file = 'a.txt'; await flush()
  h.store.statusIsStale = true
  assert.equal(h.canRestore.value, false)
  assert.equal(h.canDelete.value, false)
  h.store.statusIsStale = false
  h.setValue('test:draft', 'pending')
  assert.equal(h.canDelete.value, false)
  assert.equal(h.canRestore.value, false)
  h.stop()
})

test('failed restores refresh status and release the busy lock without reporting success', async () => {
  const h = harness({ read: async () => ({ ...detail(), info: { revision: 42, schedule: 'normal' } }), restore: async () => { throw Error('local changes') } })
  await flush(); await h.restoreTarget()
  assert.equal(h.refreshes(), 1)
  assert.equal(h.store.operationBusy, false)
  assert.equal(h.saving.value, false)
  assert.match(h.error.value, /local changes/)
  h.stop()
})


test('export captures the selected directory or file and releases the operation lock', async () => {
  for (const directory of [true, false]) {
    const h = harness({ read: async () => ({ ...detail(), directory, info: { revision: 42 } }) })
    await flush()
    assert.equal(h.canExport.value, true)
    await h.exportTarget()
    assert.deepEqual(h.calls[0], ['export', '/wc', 'a.txt', '/exports/new'])
    assert.equal(h.store.operationBusy, false)
    assert.equal(h.exporting.value, false)
    assert.equal(h.refreshes(), 0)
    h.stop()
  }
})

test('export cancellation and changed selection do not write; failures release the lock', async () => {
  for (const destination of [async () => null, async () => { h.props.file = 'b.txt'; return '/exports/new' }]) {
    var h = harness({ read: async () => ({ ...detail(), info: { revision: 42 } }), destination })
    await flush(); await h.exportTarget()
    assert.equal(h.calls.length, 0)
    assert.equal(h.store.operationBusy, false)
    h.stop()
  }
  const failure = harness({ read: async () => ({ ...detail(), info: { revision: 42 } }), export: async () => { throw Error('existing directory') } })
  await flush(); await failure.exportTarget()
  assert.equal(failure.store.operationBusy, false)
  assert.equal(failure.exporting.value, false)
  failure.stop()
  const loose = harness({ read: async () => ({ ...detail(), info: null }) })
  await flush()
  assert.equal(loose.canExport.value, false)
  loose.stop()
})


test('symbolic links cannot export, blame or restore their target through the inspector', async () => {
  const h = harness({ read: async () => ({ ...detail(), link_target: '/outside/node_modules', editable: false, info: { revision: 42, schedule: 'normal' } }) })
  await flush()
  assert.equal(h.error.value, '')
  assert.equal(h.details.value.link_target, '/outside/node_modules')
  assert.equal(h.canExport.value, false)
  assert.equal(h.canBlame.value, false)
  assert.equal(h.canRestore.value, false)
  h.openBlame()
  await h.exportTarget()
  await h.restoreTarget()
  assert.equal(h.calls.length, 0)
  assert.equal(h.events.some(event => event[0] === 'blame'), false)
  h.stop()
})
