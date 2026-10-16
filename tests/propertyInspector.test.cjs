const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const flush = async () => { await vue.nextTick(); await Promise.resolve(); await vue.nextTick() }
const detail = (properties = []) => ({ editable: true, directory: false, properties, info: {}, size: 10 })
const property = (name, value) => ({ name, value, binary: false })

function harness(api = {}) {
  const props = vue.reactive({ workspace: '/wc', file: 'a.txt', disabled: false })
  const store = vue.reactive({ currentPath: '/wc', operationBusy: false, setOperationBusy(value) { this.operationBusy = value } })
  const calls = [], events = []
  let refreshes = 0
  const mocks = {
    vue: { ...vue, onBeforeUnmount() {} },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@/api/svn': {
      svnPropertyDetails: api.read || (async () => detail([property('test:value', 'original')])),
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
  scope.run(() => vm.runInNewContext(ts.transpileModule(script + '\nexports.actions = { details, values, original, dirty, fetching, saving, error, save, setValue, resetValues, load };', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context))
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
