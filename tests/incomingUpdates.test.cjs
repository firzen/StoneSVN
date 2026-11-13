const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const vue = require('vue')

function harness() {
  const store = vue.reactive({ currentPath: '/a' })
  const calls = []
  let now = 100_000
  const mocks = {
    vue,
    '@/stores/workspace': { useWorkspaceStore: () => store },
    '@/composables/useSettings': { useSettings: () => ({ settings: { logLimit: 50 } }) },
    '@/api/svn': { svnIncomingState: (path, limit, interactive) => new Promise((resolve, reject) => calls.push({ path, limit, interactive, resolve, reject })) },
  }
  const context = { exports: {}, Date: { now: () => now }, require: name => mocks[name] }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/composables/useIncomingUpdates.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  return { ...context.exports.useIncomingUpdates(), calls, store, advance: () => { now += 30_001 } }
}
const result = total => ({ revision: 200, total, logs: [] })

test('consumers share one request and the badge total is independent of the displayed logs', async () => {
  const h = harness()
  const a = h.check('/a'), b = h.check('/a')
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].interactive, false)
  h.calls[0].resolve(result(105))
  await Promise.all([a, b])
  assert.equal(h.state.value.total, 105)
  assert.equal(h.state.value.logs.length, 0)
  await h.check('/a')
  assert.equal(h.calls.length, 1)
  h.advance()
  const poll = h.check('/a')
  h.calls[1].resolve(result(0))
  await poll
  assert.equal(h.state.value.total, 0)
})

test('late results remain scoped to their project and invalidated requests cannot restore old counts', async () => {
  const h = harness()
  const old = h.check('/a')
  h.store.currentPath = '/b'
  const current = h.check('/b')
  h.calls[1].resolve(result(3))
  await current
  h.calls[0].resolve(result(10))
  await old
  assert.equal(h.state.value.total, 3)
  h.store.currentPath = '/a'
  assert.equal(h.state.value.total, 10)
  const stale = h.check('/a', true)
  h.invalidate('/a')
  const fresh = h.check('/a', true)
  h.calls[3].resolve(result(0))
  await fresh
  h.calls[2].resolve(result(20))
  await stale
  assert.equal(h.state.value.total, 0)
})

test('silent auth failures retain the last count and pause polling until a manual retry', async () => {
  const h = harness()
  const first = h.check('/a')
  h.calls[0].resolve(result(7))
  await first
  h.advance()
  const fail = h.check('/a')
  h.calls[1].reject(new Error('svn: E215004: Authentication failed'))
  await fail
  assert.equal(h.state.value.total, 7)
  assert.equal(h.state.value.status, 'failed')
  h.advance()
  await h.check('/a')
  assert.equal(h.calls.length, 2)
  const retry = h.check('/a', true, true)
  assert.equal(h.calls[2].interactive, true)
  h.calls[2].resolve(result(0))
  await retry
  assert.equal(h.state.value.status, 'ready')
  assert.equal(h.state.value.total, 0)
})

test('transient network failures are retried after the polling interval', async () => {
  const h = harness()
  const fail = h.check('/a')
  h.calls[0].reject(new Error('svn: E170013: Unable to connect'))
  await fail
  assert.equal(h.state.value.total, null)
  await h.check('/a')
  assert.equal(h.calls.length, 1)
  h.advance()
  const retry = h.check('/a')
  h.calls[1].resolve(result(2))
  await retry
  assert.equal(h.state.value.total, 2)
})
