const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

function harness(read, saved = '{}') {
  const data = new Map([['orcasvn-property-tree', saved]])
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  const context = { exports: {}, require: name => {
    if (name === 'vue') return vue
    if (name === '@/api/svn') return { workspaceChildren: read }
    throw new Error(name)
  } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/composables/usePropertyTree.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return { tree: context.exports.createPropertyTree(read, storage), data }
}
const entry = (path, directory = false) => ({ path, name: path.split('/').pop(), directory })
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

test('opening a project reads only its root; expansion loads once and selection never scans children', async () => {
  const calls = []
  const { tree } = harness(async (wc, path) => {
    calls.push([wc, path])
    return path === '.' ? [entry('dir', true), entry('clean.txt')] : [entry('dir/nested', true), entry('dir/file.txt')]
  })
  await tree.open('/wc')
  assert.deepEqual(calls, [['/wc', '.']])
  tree.select('/wc', 'dir')
  assert.equal(calls.length, 1)
  await tree.toggle('/wc', 'dir'); await flush()
  assert.deepEqual(calls, [['/wc', '.'], ['/wc', 'dir']])
  await tree.toggle('/wc', 'dir'); await tree.toggle('/wc', 'dir'); await flush()
  assert.equal(calls.length, 2)
  assert.ok(tree.rows(['/wc']).some(row => row.path === 'dir/file.txt'))
  assert.ok(!calls.some(([, path]) => path === 'dir/nested'))
})

test('directory reads coalesce, stale responses cannot overwrite a forced refresh, and failures can retry', async () => {
  const pending = []
  const { tree } = harness(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
  const initial = tree.load('/wc', '.')
  assert.equal(tree.load('/wc', '.'), initial)
  const fresh = tree.load('/wc', '.', true)
  pending[1].resolve([entry('fresh.txt')]); await fresh
  pending[0].resolve([entry('stale.txt')]); await initial
  assert.equal(tree.directory('/wc', '.').children[0].path, 'fresh.txt')
  const failing = tree.load('/wc', 'bad')
  pending[2].reject(new Error('permission denied')); await failing
  assert.match(tree.directory('/wc', 'bad').error, /permission denied/)
  const retry = tree.load('/wc', 'bad', true)
  pending[3].resolve([]); await retry
  assert.equal(tree.directory('/wc', 'bad').error, '')
  assert.equal(tree.directory('/wc', 'bad').loaded, true)
})

test('refresh visits only expanded directories and keeps a selection inside a collapsed directory', async () => {
  const calls = [], contents = { '.': [entry('open', true), entry('closed', true)], open: [entry('open/file')], closed: [entry('closed/file')] }
  const { tree } = harness(async (_wc, path) => { calls.push(path); return contents[path] })
  await tree.open('/wc')
  await tree.toggle('/wc', 'open'); await tree.toggle('/wc', 'closed'); await flush()
  tree.select('/wc', 'closed/file')
  await tree.toggle('/wc', 'closed')
  calls.length = 0
  await tree.refresh('/wc')
  assert.deepEqual(calls, ['.', 'open'])
  assert.equal(tree.project('/wc').selected, 'closed/file')
  contents['.'] = [entry('open', true)]
  await tree.refresh('/wc')
  assert.equal(tree.project('/wc').selected, '.')
})

test('projects keep independent selections and expanded paths survive reopening without loading collapsed descendants', async () => {
  const calls = []
  const read = async (wc, path) => { calls.push([wc, path]); return path === '.' ? [entry('dir', true)] : [entry('dir/file')] }
  const { tree, data } = harness(read)
  await tree.open('/one'); await tree.toggle('/one', 'dir'); await flush(); tree.select('/one', 'dir/file')
  await tree.open('/two'); tree.select('/two', '.')
  assert.equal(tree.project('/one').selected, 'dir/file')
  calls.length = 0
  const reopened = harness(read, data.get('orcasvn-property-tree')).tree
  await reopened.open('/one')
  assert.equal(reopened.project('/one').selected, 'dir/file')
  assert.deepEqual(calls, [['/one', '.'], ['/one', 'dir']])
  await tree.toggle('/two', '.')
  calls.length = 0
  const collapsed = harness(read, data.get('orcasvn-property-tree')).tree
  await collapsed.open('/two')
  assert.equal(collapsed.project('/two').expanded.has('.'), false)
  assert.equal(calls.length, 0)
})

test('directory links retain folder type without expanding or restoring linked descendants', async () => {
  const calls = []
  const { tree } = harness(async (_wc, path) => {
    calls.push(path)
    return path === '.' ? [
      { ...entry('node_modules', true), expandable: false },
      { ...entry('empty-folder', true), expandable: true },
    ] : []
  }, JSON.stringify({ '/wc': { selected: '.', expanded: ['.', 'node_modules', 'empty-folder'] } }))
  await tree.open('/wc')
  const rows = tree.rows(['/wc'])
  const linked = rows.find(row => row.path === 'node_modules')
  assert.equal(linked.directory, true)
  assert.equal(linked.expandable, false)
  assert.ok(!calls.includes('node_modules'))
  assert.ok(calls.includes('empty-folder'))
  assert.equal(rows.filter(row => row.path === 'node_modules').length, 1)
  await tree.refresh('/wc')
  assert.ok(!calls.includes('node_modules'))
})
