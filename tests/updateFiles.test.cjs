const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/updateFiles.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
const { pathParts, filterUpdateRows } = context.exports

test('update paths preserve Unicode and split Windows and root paths for display', () => {
  assert.equal(pathParts('目录\\子目录\\中文 @.txt').directory, '目录/子目录/')
  assert.equal(pathParts('目录\\子目录\\中文 @.txt').name, '中文 @.txt')
  assert.equal(pathParts('README.md').directory, '.')
  assert.equal(pathParts('docs/').name, 'docs')
})
test('update filters combine status and path search, prioritize conflicts and never mutate input', () => {
  const rows = [{ path: 'src/z.ts', status: 'modified' }, { path: 'docs/new.md', status: 'added' }, { path: 'src/a.ts', status: 'modified' }, { path: 'z/conflict.ts', status: 'conflicted' }]
  const sorted = filterUpdateRows(rows, '', '')
  assert.equal(sorted[0].status, 'conflicted')
  assert.deepEqual(Array.from(filterUpdateRows(rows, 'modified', ' SRC/ '), row => row.path), ['src/a.ts', 'src/z.ts'])
  assert.equal(filterUpdateRows(rows, 'deleted', '').length, 0)
  assert.equal(rows[0].path, 'src/z.ts')
})
