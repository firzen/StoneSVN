const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vue = require('vue')
const vm = require('node:vm')
const compile = file => { const c = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, c); return c.exports }
const docs = compile('src/utils/conflictDocument.ts')
const flush = async () => { await vue.nextTick(); await Promise.resolve(); await vue.nextTick() }
const detail = fields => ({ text: false, property: true, tree: false, operation: 'update', reason: '', action: '', directory: false, working: null, local: null, base: null, incoming: null,
  properties: [{ name: 'demo:label', local: 'local', base: 'base', incoming: 'incoming', incoming_known: true }], rejection: null, unavailable: [], token: 'review-token', ...fields })
function harness(api = {}) {
  const props = vue.reactive({ workspace: '/wc', file: 'property.txt', diff: '' })
  const store = vue.reactive({ currentPath: '/wc', operationBusy: false, statusIsStale: false, setOperationBusy(value) { this.operationBusy = value } })
  const calls = [], messages = []
  const mocks = {
    vue, 'vue-i18n': { useI18n: () => ({ t: key => key }) },
    'element-plus/es/components/message/index': { ElMessage: { success: m => messages.push(['success', m]), error: m => messages.push(['error', m]) } },
    'element-plus/es/components/message-box/index': { ElMessageBox: { confirm: api.confirm || (async () => {}) } },
    '@/api/svn': {
      svnConflictDetails: api.details || (async () => detail(api.fields)),
      svnApplyConflict: async (...args) => { calls.push(args); if (api.apply) await api.apply(...args) },
    },
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/composables/useWorkspace': { useWorkspace: () => ({ refreshStatusAfterMutation: async () => true }) },
    '@/utils/conflictDocument': docs,
  }
  const source = fs.readFileSync('src/components/ConflictInspector.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const c = { exports: {}, defineProps: () => props, defineEmits: () => () => {}, require: key => { assert.ok(key in mocks, key); return mocks[key] } }
  const scope = vue.effectScope()
  scope.run(() => vm.runInNewContext(ts.transpileModule(source + '\nexports.actions={load,apply,chooseProperty,details,canApply,propertyManual,textResult,textReviewed,treeChoice,treeReviewed,busy};', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, c))
  return { ...c.exports.actions, props, store, calls, messages, stop: () => scope.stop() }
}
test('property resolution sends only the reviewed property and never rewrites file content', async () => {
  const h = harness(); await flush()
  assert.equal(h.canApply.value, false)
  h.chooseProperty('demo:label', 'incoming')
  assert.equal(h.canApply.value, true)
  await h.apply()
  const result = JSON.parse(JSON.stringify(h.calls[0]))
  assert.equal(result[2].text, null)
  assert.equal(result[2].token, 'review-token')
  assert.deepEqual(result[2].properties, [{ name: 'demo:label', value: 'incoming' }])
  h.stop()
})
test('mixed conflicts require text AND property review; conflict markers are hidden in the initial draft', async () => {
  const h = harness({ fields: { text: true, working: 'before\n<<<<<<< .mine\nlocal\n=======\nincoming\n>>>>>>> .r2\nafter\n' } }); await flush()
  assert.equal(h.textResult.value, 'before\nlocal\nafter\n')
  h.textReviewed.value = true; assert.equal(h.canApply.value, false)
  h.chooseProperty('demo:label', 'chosen'); assert.equal(h.canApply.value, true)
  h.textResult.value = '<<<<<<< unresolved\n'; assert.equal(h.canApply.value, false)
  h.stop()
})
test('a late load cannot replace the conflict details for the new selection', async () => {
  let finish
  const h = harness({ details: async (_, file) => file === 'property.txt' ? new Promise(resolve => { finish = resolve }) : detail({ token: 'new-file' }) })
  h.props.file = 'other.txt'; await flush()
  assert.equal(h.details.value.token, 'new-file')
  finish(detail({ token: 'old-file' })); await flush()
  assert.equal(h.details.value.token, 'new-file')
  h.stop()
})
test('double apply and a selection change during delete confirmation cannot modify the wrong file', async () => {
  let finish
  const h = harness({ apply: () => new Promise(resolve => { finish = resolve }) }); await flush()
  h.chooseProperty('demo:label', 'chosen')
  const pending = h.apply(); await h.apply()
  assert.equal(h.calls.length, 1)
  finish(); await pending; h.stop()
  let confirm
  const tree = harness({ fields: { text: false, property: false, tree: true, reason: 'edit', action: 'delete' }, confirm: () => new Promise(resolve => { confirm = resolve }) }); await flush()
  tree.treeChoice.value = 'delete'; const deletion = tree.apply()
  tree.props.file = 'other.txt'; await flush(); confirm(); await deletion
  assert.equal(tree.calls.length, 0)
  tree.stop()
})
