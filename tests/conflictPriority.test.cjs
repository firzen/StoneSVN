const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/composables/useSvnStatus.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
const { isConflicted, prioritizeConflicts } = context.exports

test('text, property-only and tree conflicts lead the workspace without reordering peers or mutating the snapshot', () => {
  const entry = (path, status_code, prop_status = 'none') => Object.freeze({ path, status_code, prop_status })
  const files = Object.freeze([
    entry('modified.txt', 'modified'), entry('text.txt', 'conflicted'),
    entry('untracked.txt', 'unversioned'), entry('property.txt', 'normal', 'conflicted'),
    entry('both.txt', 'conflicted', 'conflicted'), entry('tree.txt', 'conflicted'),
    entry('added.txt', 'added'),
  ])
  const sorted = prioritizeConflicts(files)
  assert.deepEqual(Array.from(sorted, f => f.path), ['text.txt', 'property.txt', 'both.txt', 'tree.txt', 'modified.txt', 'untracked.txt', 'added.txt'])
  assert.equal(files[0].path, 'modified.txt')
  assert.equal(sorted[0], files[1])
  assert.equal(isConflicted(files[2]), false)
  assert.equal(isConflicted(files[3]), true)
  assert.equal(prioritizeConflicts([]).length, 0)
})
