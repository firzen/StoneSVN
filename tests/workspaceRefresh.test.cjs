const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function harness() {
  const requests = [], snapshots = new Map(), writes = [], invalidations = []
  const store = {
    currentPath: '/a', statusList: [], svnInfo: null, gitignorePatterns: [],
    setCurrentPath(path) { this.currentPath = path },
    setStatusList(list) { this.statusList = list },
    setSvnInfo(info) { this.svnInfo = info },
    setStatusIsStale(value) { this.statusIsStale = value },
    setLoading(value) { this.isLoading = value },
    setError(value) { this.error = value },
    setGitignorePatterns(value) { this.gitignorePatterns = value },
    setGitignoreMtime() {}, setGitignoreWorkspacePath() {}, rememberWorkspace() {},
  }
  const matchContext = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/gitignore.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, matchContext)
  const settings = { gitignoreEnabled: false, filterRules: '.gitignore' }
  let filter = async (list, patterns) => matchContext.exports.filterByGitignore(list, patterns)
  const mocks = {
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/api/svn': {
      svnStatus: (path, force = false) => { const request = { path, force, ...deferred() }; requests.push(request); return request.promise },
      svnLocalRevision: async () => 12,
    },
    '@tauri-apps/plugin-dialog': {},
    '@/composables/useSettings': { useSettings: () => ({ settings }) },
    '@/utils/gitignore': matchContext.exports,
    '@/utils/gitignoreWorker': { filterByGitignoreAsync: (list, patterns) => filter(list, patterns) },
    '@/utils/workspaceSnapshot': { getWorkspaceSnapshot: path => snapshots.get(path) || null, cacheWorkspaceSnapshot: (...args) => writes.push(args), invalidateWorkspaceSnapshot: path => { invalidations.push(path); snapshots.delete(path) } },
    '@/utils/svnInfoCache': { getCachedSvnInfoMetadata: () => ({ url: 'file:///repo' }) },
  }
  const context = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name] } }
  const code = ts.transpileModule(fs.readFileSync('src/composables/useWorkspace.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, context)
  return { store, settings, requests, snapshots, writes, invalidations, useWorkspace: context.exports.useWorkspace, setFilter: value => { filter = value } }
}

test('separate consumers share an in-flight refresh and background polls reuse fresh state', async () => {
  const h = harness(), a = h.useWorkspace(), b = h.useWorkspace()
  const first = a.refreshStatus(), second = b.refreshStatus()
  assert.equal(first, second)
  assert.equal(h.requests.length, 1)
  h.requests[0].resolve([{ path: 'first' }])
  assert.equal(await first, true)
  await b.refreshStatusIfStale(60_000)
  assert.equal(h.requests.length, 1)
  const manual = a.refreshStatus()
  assert.equal(h.requests.length, 2)
  h.requests[1].resolve([{ path: 'manual' }])
  assert.equal(await manual, true)
})

test('failed refresh is retried rather than treated as fresh', async () => {
  const h = harness(), workspace = h.useWorkspace()
  const failed = workspace.refreshStatus()
  h.requests[0].reject(new Error('status failed'))
  assert.equal(await failed, false)
  const retry = workspace.refreshStatusIfStale(60_000)
  assert.equal(h.requests.length, 2)
  h.requests[1].resolve([])
  assert.equal(await retry, true)
})

test('post-mutation scan supersedes an earlier background scan', async () => {
  const h = harness(), workspace = h.useWorkspace()
  const background = workspace.refreshStatus()
  const mutation = workspace.refreshStatusAfterMutation()
  assert.equal(h.requests.length, 2)
  h.requests[1].resolve([{ path: 'new' }])
  assert.equal(await mutation, true)
  h.requests[0].resolve([{ path: 'old' }])
  assert.equal(await background, false)
  assert.equal(h.store.statusList[0].path, 'new')
  assert.equal(h.store.isLoading, false)
})

test('workspace switch rejects late results from the previous workspace', async () => {
  const h = harness(), workspace = h.useWorkspace()
  const previous = workspace.refreshStatus()
  const current = workspace.loadWorkspace('/b')
  assert.equal(h.requests[1].path, '/b')
  h.requests[1].resolve([{ path: 'b' }])
  assert.equal(await current, true)
  h.requests[0].resolve([{ path: 'a' }])
  assert.equal(await previous, false)
  assert.equal(h.store.statusList[0].path, 'b')
})

test('late worker reply cannot overwrite status after a mutation', async () => {
  const h = harness(), workspace = h.useWorkspace(), worker = deferred()
  h.setFilter(list => list[0]?.path === 'old' ? worker.promise : Promise.resolve(list))
  const old = workspace.refreshStatus()
  h.requests[0].resolve([{ path: 'old' }])
  // Let the old request reach the asynchronous filter.
  for (let i = 0; i < 10; i++) await Promise.resolve()
  const fresh = workspace.refreshStatusAfterMutation()
  h.requests[1].resolve([{ path: 'fresh' }])
  assert.equal(await fresh, true)
  worker.resolve([{ path: 'old' }])
  assert.equal(await old, false)
  assert.equal(h.store.statusList[0].path, 'fresh')
})


test('reopening shows a cached small change list synchronously and verifies it in the background', async () => {
  const h = harness(), workspace = h.useWorkspace()
  h.snapshots.set('/b', { statusList: [{ path: 'cached.ts' }], svnInfo: { revision: 11 } })
  const pending = workspace.loadWorkspace('/b')
  assert.equal(h.store.currentPath, '/b')
  assert.equal(h.store.statusList[0].path, 'cached.ts')
  assert.equal(h.store.svnInfo.revision, 11)
  assert.equal(h.store.statusIsStale, true)
  assert.equal(h.store.isLoading, true)
  assert.equal(h.requests.length, 1)
  h.requests[0].resolve([{ path: 'fresh.ts' }])
  assert.equal(await pending, true)
  assert.equal(h.store.statusList[0].path, 'fresh.ts')
  assert.equal(h.store.statusIsStale, false)
  assert.equal(h.store.isLoading, false)
  assert.equal(h.writes[0][0], '/b')
  assert.equal(h.writes[0][1][0].path, 'fresh.ts')
})

test('an empty cached list is still marked unverified until the scan succeeds', async () => {
  const h = harness()
  h.snapshots.set('/b', { statusList: [], svnInfo: { revision: 11 } })
  const pending = h.useWorkspace().loadWorkspace('/b')
  assert.equal(h.store.statusIsStale, true)
  h.requests[0].resolve([{ path: 'new.ts' }])
  assert.equal(await pending, true)
  assert.equal(h.store.statusIsStale, false)
})

test('failed verification preserves the cached view but does not mark it fresh', async () => {
  const h = harness(), workspace = h.useWorkspace()
  h.snapshots.set('/b', { statusList: [{ path: 'cached.ts' }], svnInfo: { revision: 11 } })
  const pending = workspace.loadWorkspace('/b')
  h.requests[0].reject(new Error('workspace unavailable'))
  assert.equal(await pending, false)
  assert.equal(h.store.currentPath, '/b')
  assert.equal(h.store.statusList[0].path, 'cached.ts')
  assert.equal(h.store.statusIsStale, true)
  assert.match(h.store.error, /workspace unavailable/)
  assert.equal(h.writes.length, 0)
  const retry = workspace.refreshStatus()
  h.requests[1].resolve([])
  assert.equal(await retry, true)
  assert.equal(h.store.statusIsStale, false)
})

test('post-mutation scan invalidates persistence and old file actions until fresh status arrives', async () => {
  const h = harness()
  h.snapshots.set('/a', { statusList: [{ path: 'old.ts' }], svnInfo: { revision: 11 } })
  const pending = h.useWorkspace().refreshStatusAfterMutation()
  assert.deepEqual(h.invalidations, ['/a'])
  assert.equal(h.snapshots.has('/a'), false)
  assert.equal(h.store.statusIsStale, true)
  h.requests[0].resolve([])
  await pending
  assert.equal(h.store.statusIsStale, false)
})

test('filesystem-scoped background checks do not satisfy an explicit complete refresh', async () => {
  const h = harness(), workspace = h.useWorkspace()
  const background = workspace.refreshStatusIfStale(0)
  assert.equal(h.requests[0].force, false)
  const manual = workspace.refreshStatus()
  assert.equal(h.requests[1].force, true)
  h.requests[1].resolve([{ path: 'verified.ts' }])
  assert.equal(await manual, true)
  h.requests[0].resolve([{ path: 'old.ts' }])
  assert.equal(await background, false)
  assert.equal(h.store.statusList[0].path, 'verified.ts')
})

test('refresh applies only global rules, clears them when disabled, and never exposes raw paths', async () => {
  const h = harness(), workspace = h.useWorkspace()
  h.settings.gitignoreEnabled = true
  h.settings.filterRules = '.gitignore\n/_tmp1010/log*'
  const pendingFilter = deferred()
  h.setFilter(() => pendingFilter.promise)
  const first = workspace.refreshStatus()
  h.requests[0].resolve([{ path: '.gitignore' }, { path: '_tmp1010/log/x' }, { path: 'source.ts' }])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.store.statusList.length, 0)
  assert.equal(h.store.statusIsStale, true)
  pendingFilter.resolve([{ path: 'source.ts' }])
  assert.equal(await first, true)
  assert.equal(h.store.gitignorePatterns.length, 2)
  assert.equal(h.store.statusIsStale, false)

  h.settings.gitignoreEnabled = false
  const second = workspace.refreshStatus()
  h.requests[1].reject(new Error('offline'))
  assert.equal(await second, false)
  assert.equal(h.store.gitignorePatterns.length, 0)
  assert.equal(h.store.statusIsStale, true)
})

test('enabled filters select names at any depth and paths only at the workspace root', async () => {
  const h = harness(), workspace = h.useWorkspace()
  h.settings.gitignoreEnabled = true
  h.settings.filterRules = '.gitignore\n/_tmp1010/log*'
  const refresh = workspace.refreshStatus()
  h.requests[0].resolve(['.gitignore', 'src/.gitignore', '_tmp1010/logs/x', 'other/_tmp1010/logs/x', 'source.ts'].map(path => ({ path })))
  assert.equal(await refresh, true)
  assert.deepEqual(h.store.statusList.map(file => file.path), ['other/_tmp1010/logs/x', 'source.ts'])
})
