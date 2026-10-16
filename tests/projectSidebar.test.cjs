const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const pinia = require('pinia')

function harness(saved = []) {
  const storage = new Map([['orcasvn-recent-workspaces', JSON.stringify(saved)]])
  const invalidated = []
  const mocks = {
    vue, pinia,
    '@/utils/workspaceSnapshot': { invalidateWorkspaceSnapshot: path => invalidated.push(path) },
    '@/utils/statusSnapshot': { sameStatusSnapshot: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  }
  const context = { exports: {}, localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }, require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/stores/workspace.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  pinia.setActivePinia(pinia.createPinia())
  return { store: context.exports.useWorkspaceStore(), storage, invalidated }
}

test('existing workspaces become a stable project list and projects beyond ten survive reopening', () => {
  const h = harness(['/a', '/b', '/a', null, ''])
  assert.deepEqual([...h.store.recentWorkspaces], ['/a', '/b'])
  for (let n = 0; n < 15; n++) h.store.rememberWorkspace(`/project-${n}`)
  const before = [...h.store.recentWorkspaces]
  h.store.rememberWorkspace('/a')
  assert.deepEqual([...h.store.recentWorkspaces], before)
  assert.equal(h.store.recentWorkspaces.length, 17)
  assert.equal(h.storage.get('orcasvn-last-workspace'), '/a')
  assert.deepEqual([...harness(JSON.parse(h.storage.get('orcasvn-recent-workspaces'))).store.recentWorkspaces], before)
})

test('project order persists, invalid drag targets do nothing, and removing an inactive project preserves the active project', () => {
  const h = harness(['/a', '/b', '/c'])
  h.store.setCurrentPath('/a')
  h.store.moveProject('/c', '/a')
  h.store.moveProject('/missing', '/a')
  assert.deepEqual(JSON.parse(h.storage.get('orcasvn-recent-workspaces')), ['/c', '/a', '/b'])
  h.store.removeRecentWorkspace('/b')
  assert.equal(h.store.currentPath, '/a')
  assert.deepEqual(h.invalidated, ['/b'])
  assert.deepEqual([...h.store.recentWorkspaces], ['/c', '/a'])
})

test('verified project counts include property-only changes and cached counts stay isolated during switching', () => {
  const h = harness(['/a', '/b'])
  h.store.setCurrentPath('/a')
  h.store.setStatusList([
    { status_code: 'normal', prop_status: 'modified' },
    { status_code: 'normal', prop_status: 'none' },
    { status_code: 'unversioned', prop_status: 'none' },
  ])
  h.store.setStatusIsStale(false)
  assert.equal(h.store.projectSummaries['/a'].count, 2)
  h.store.setCurrentPath('/b')
  h.store.setStatusIsStale(true)
  h.store.setStatusList([])
  assert.equal(h.store.projectSummaries['/b'], undefined)
  h.store.setStatusIsStale(false)
  assert.equal(h.store.projectSummaries['/a'].count, 2)
  assert.equal(h.store.projectSummaries['/b'].count, 0)
})
