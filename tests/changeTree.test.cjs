const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const compiled = ts.transpileModule(fs.readFileSync('src/utils/changeTree.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const context = { exports: {} }
vm.runInNewContext(compiled, context)
const { buildChangeTree, isWithinDirectory } = context.exports
const entry = (path) => ({ path, status_code: 'modified', prop_status: 'none' })
test('directory boundaries exclude similarly named siblings and normalize Windows paths', () => {
  assert.equal(isWithinDirectory('zhy/profiles-old/a', 'zhy/profiles'), false)
  assert.equal(isWithinDirectory('zhy/profiles/a', 'zhy/profiles/'), true)
  assert.equal(isWithinDirectory('zhy\\profiles\\a', 'zhy/profiles'), true)
})
test('scoped tree preserves original target paths and directory property changes', () => {
  const tree = buildChangeTree([entry('zhy/profiles'), entry('zhy/profiles/a'), entry('zhy/profiles/nested/b'), entry('zhy/profiles-old/c')], 'zhy/profiles')
  assert.equal(tree.length, 1)
  assert.equal(tree[0].path, 'zhy/profiles')
  assert.equal(tree[0].targets.length, 3)
  assert.ok(tree[0].targets.includes('zhy/profiles'))
  assert.ok(!tree[0].targets.includes('zhy/profiles-old/c'))
  assert.equal(tree[0].children[0].path, 'zhy/profiles/nested')
})
test('root properties and nested changes each appear once; empty scope has no phantom targets', () => {
  const tree = buildChangeTree([entry('.'), entry('A/file'), entry('B/file')])
  assert.equal(tree[0].targets.length, 3)
  assert.equal(new Set(tree[0].targets).size, 3)
  assert.equal(buildChangeTree([entry('B/file')], 'A').length, 0)
})

test('filtering tree rows keeps ancestor groups and their original hidden selection targets', () => {
  const { filterChangeTree } = context.exports
  const tree = buildChangeTree([entry('src/visible.ts'), entry('src/hidden.ts'), entry('docs/readme.md')])
  const visible = filterChangeTree(tree, new Set(['src/visible.ts']))
  assert.equal(visible.length, 1)
  const src = visible[0].children[0]
  assert.equal(src.path, 'src')
  assert.equal(src.children.length, 1)
  assert.equal(src.children[0].path, 'src/visible.ts')
  assert.deepEqual(Array.from(src.targets).sort(), ['src/hidden.ts', 'src/visible.ts'])
  assert.equal(tree[0].children.length, 2)
  assert.equal(filterChangeTree(tree, new Set()).length, 0)
})

test('flattening a tree preserves depth and collapsed groups retain every selection target', () => {
  const { flattenChangeTree } = context.exports
  const roots = buildChangeTree([entry('A/one'), entry('A/nested/two'), entry('B/three')])[0].children
  const expanded = flattenChangeTree(roots)
  assert.deepEqual(Array.from(expanded, row => [row.node.path, row.depth]), [
    ['A', 0], ['A/nested', 1], ['A/nested/two', 2], ['A/one', 1], ['B', 0], ['B/three', 1]
  ])
  const collapsed = flattenChangeTree(roots, new Set(['A']))
  assert.deepEqual(Array.from(collapsed, row => row.node.path), ['A', 'B', 'B/three'])
  assert.deepEqual(Array.from(collapsed[0].node.targets).sort(), ['A/nested/two', 'A/one'])
  assert.equal(flattenChangeTree([]).length, 0)
})
