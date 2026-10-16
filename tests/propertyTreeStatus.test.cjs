const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/propertyTreeStatus.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
const { propertyTreeStatus, statusSymbol } = context.exports

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
