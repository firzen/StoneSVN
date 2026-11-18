const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/conflictDocument.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context)
const { conflictBlocks, mergeConflictChoices, hasConflictMarkers } = context.exports

test('conflict choices preserve CRLF, surrounding edits, Unicode and independent unresolved blocks', () => {
  const block = '<<<<<<< .mine\r\n本地\r\n||||||| .r1\r\n原文\r\n=======\r\n传入\r\n>>>>>>> .r2\r\n'
  const text = 'before edited\r\n' + block + 'middle\r\n' + block + 'after without newline'
  const blocks = conflictBlocks(text)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].line, 2)
  assert.equal(blocks[0].base, '原文\r\n')
  const one = mergeConflictChoices(text, blocks, { 0: 'local' })
  assert.equal(one, 'before edited\r\n本地\r\nmiddle\r\n' + block + 'after without newline')
  assert.equal(hasConflictMarkers(one), true)
  const both = mergeConflictChoices(text, blocks, { 0: 'local', 1: 'incoming' })
  assert.equal(both, 'before edited\r\n本地\r\nmiddle\r\n传入\r\nafter without newline')
  assert.equal(hasConflictMarkers(both), false)
})
test('two-way conflicts, empty sides and files edited externally are handled without guessing', () => {
  const text = '<<<<<<< local\n=======\nincoming\n>>>>>>> incoming'
  const blocks = conflictBlocks(text)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].base, null)
  assert.equal(mergeConflictChoices(text, blocks, { 0: 'local' }), '')
  assert.equal(conflictBlocks('edited externally\n').length, 0)
  assert.equal(conflictBlocks('<<<<<<< local\nunfinished').length, 0)
  assert.equal(hasConflictMarkers('<<<<<<< local\nunfinished'), true)
  assert.equal(hasConflictMarkers('literal inline ======= is ordinary text'), false)
})
