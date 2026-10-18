const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/propertyTreeStatus.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
const { propertyTreeStatus, statusSymbol, buildPropertyTreeDescendantStatuses, propertyTreeStatuses } = context.exports

test('directory summaries collect deep changes in fixed order without mixing sibling paths', () => {
  const entries = new Map([
    ['src/deep/deleted.php', { status_code: 'deleted' }],
    ['src/new', { status_code: 'unversioned' }],
    ['src/added.php', { status_code: 'added' }],
    ['src/deep/changed.php', { status_code: 'modified' }],
    ['src/property.php', { status_code: 'normal', prop_status: 'modified' }],
    ['src-other/file', { status_code: 'added' }],
    ['clean/file', { status_code: 'normal' }],
  ])
  const summaries = buildPropertyTreeDescendantStatuses(entries)
  assert.equal(summaries.get('src').join(','), 'modified,added,unversioned,deleted')
  assert.equal(summaries.get('src/deep').join(','), 'modified,deleted')
  assert.equal(summaries.get('src-other').join(','), 'added')
  assert.equal(summaries.get('.').join(','), 'modified,added,unversioned,deleted')
  assert.equal(summaries.has('clean'), false)
  assert.equal(summaries.has('src/added.php'), false)
  entries.delete('src/deep/deleted.php')
  assert.equal(buildPropertyTreeDescendantStatuses(entries).get('src/deep').join(','), 'modified')
})

test('directory own status is merged once and retains existing exceptional badges', () => {
  assert.equal(propertyTreeStatuses('modified', ['modified', 'added', 'deleted']).join(','), 'modified,added,deleted')
  assert.equal(propertyTreeStatuses('conflicted', ['added']).join(','), 'added,conflicted')
  assert.equal(propertyTreeStatuses('', []).length, 0)
  const summaries = buildPropertyTreeDescendantStatuses(new Map([
    ['dir', { status_code: 'deleted' }],
    ['dir/file', { status_code: 'modified' }],
    ['.', { status_code: 'added' }],
  ]))
  assert.equal(summaries.get('dir').join(','), 'modified')
  assert.equal(summaries.get('.').join(','), 'modified,deleted')
})

test('tree badges reflect file and property changes and inherit only unversioned directories', () => {
  const entries = new Map([
    ['changed.php', { status_code: 'modified' }],
    ['dir', { status_code: 'normal', prop_status: 'modified' }],
    ['new', { status_code: 'unversioned' }],
    ['added.php', { status_code: 'added' }],
  ])
  assert.equal(statusSymbol(propertyTreeStatus('changed.php', entries)), 'M')
  assert.equal(statusSymbol(propertyTreeStatus('dir', entries)), 'M')
  assert.equal(statusSymbol(propertyTreeStatus('added.php', entries)), 'A')
  assert.equal(statusSymbol(propertyTreeStatus('new/nested/a.php', entries)), '?')
  assert.equal(propertyTreeStatus('dir/clean.php', entries), '')
  assert.equal(propertyTreeStatus('new-other/a.php', entries), '')
  assert.equal(propertyTreeStatus('clean.php', entries), '')
})
