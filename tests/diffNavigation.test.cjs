const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')

function harness(source, previous, query = { path: 'file.txt' }) {
  const callbacks = [], unmounts = [], listeners = new Map(), calls = []
  const data = new Map([
    ['orca_diff_files', JSON.stringify({ source, files: ['file.txt'] })],
    ['orca_commit_form', JSON.stringify({ workspace: '/wc', scope: 'directory', commitMessage: 'draft', selectedFiles: ['file.txt'] })],
  ])
  const previews = []
  const route = { query }
  const router = { options: { history: { state: { back: previous } } },
    resolve: path => ({ name: path.startsWith('/commit') ? 'commit' : 'log' }),
    back: () => calls.push('back'), replace: target => calls.push(target),
  }
  const mocks = {
    vue: { ...vue, onMounted: fn => callbacks.push(fn), onBeforeUnmount: fn => unmounts.push(fn) },
    'vue-router': { useRoute: () => route, useRouter: () => router, onBeforeRouteLeave() {} },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@tauri-apps/plugin-dialog': {},
    'element-plus/es/components/message/index': { ElMessage: { warning() {}, error() {} } },
    '@/api/svn': { svnFilePreview: async (...args) => { previews.push(args); return { diff: '' } } },
    '@/stores/workspace': { useWorkspaceStore: () => ({ currentPath: '/wc', statusList: [] }) },
    '@/utils/workspacePath': { toWorkspaceRelativePath: path => path },
  }
  const scope = vue.effectScope()
  const context = { exports: {}, sessionStorage: { getItem: key => data.get(key) ?? null, removeItem: key => data.delete(key) },
    window: { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key, fn) => { if (listeners.get(key) === fn) listeners.delete(key) } },
    require: name => { assert.ok(name in mocks, name); return mocks[name] },
  }
  const script = fs.readFileSync('src/views/DiffView.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  scope.run(() => vm.runInNewContext(ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context))
  callbacks.forEach(fn => fn())
  return { calls, previews, data, listeners, stop() { unmounts.forEach(fn => fn()); scope.stop() },
    key(options = {}) { const event = { key: 'Escape', preventDefault() { this.defaultPrevented = true }, ...options }; listeners.get('keydown')?.(event); return event },
  }
}

test('Escape returns to the previous commit entry and preserves its draft', () => {
  const h = harness('commit', '/commit?directory=directory')
  assert.equal(h.key().defaultPrevented, true)
  assert.deepEqual(h.calls, ['back'])
  assert.ok(h.data.has('orca_commit_form'))
  assert.equal(h.data.has('orca_diff_files'), false)
  h.stop()
  assert.equal(h.listeners.size, 0)
})

test('commit comparison without commit history explicitly restores the scoped commit page', () => {
  for (const previous of [null, '/log']) {
    const h = harness('commit', previous)
    h.key()
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [{ name: 'commit', query: { directory: 'directory' } }])
    assert.ok(h.data.has('orca_commit_form'))
    h.stop()
  }
})

test('other origins use history, direct entry falls back to workspace, and handled Escape does not navigate', () => {
  const h = harness('log', '/log')
  for (const event of [{ defaultPrevented: true }, { isComposing: true }, { repeat: true }, { key: 'Enter' }]) h.key(event)
  assert.deepEqual(h.calls, [])
  h.key()
  assert.deepEqual(h.calls, ['back'])
  h.stop()
  const direct = harness(null, null)
  direct.key()
  assert.deepEqual(JSON.parse(JSON.stringify(direct.calls)), [{ name: 'workspace' }])
  direct.stop()
})


test('update comparison loads both exact revisions against the pegged repository target', () => {
  const h = harness(null, '/update', { path: 'deleted.txt', target: 'file:///repo/deleted.txt@3', oldRev: '3', newRev: '8' })
  assert.deepEqual(h.previews, [['/wc', 'file:///repo/deleted.txt@3', 3, 8]])
  h.key()
  assert.deepEqual(h.calls, ['back'])
  h.stop()
})
