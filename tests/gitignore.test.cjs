const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')

const compiled = ts.transpileModule(fs.readFileSync('src/utils/gitignore.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const context = { exports: {} }
vm.runInNewContext(compiled, context)
const { filterByGitignore, parseGitignore } = context.exports

test('gitignore hides matching tracked and unversioned paths', () => {
  const patterns = parseGitignore('*.log\n!keep.log')
  const statuses = [
    { path: 'existing.log', status_code: 'modified' },
    { path: 'new.log', status_code: 'unversioned' },
    { path: 'keep.log', status_code: 'modified' },
    { path: 'source.ts', status_code: 'modified' },
  ]
  const visible = filterByGitignore(statuses, patterns)
  assert.deepEqual(Array.from(visible, status => status.path), ['keep.log', 'source.ts'])
  assert.equal(filterByGitignore(statuses, []).length, statuses.length)
})

test('last matching rule wins for files and directory ancestors', () => {
  const { isIgnored, createGitignoreMatcher } = context.exports
  const patterns = parseGitignore('build/\n!build/keep.ts\n*.tmp\n!keep.tmp\nkeep.tmp')
  for (const match of [path => isIgnored(path, patterns), createGitignoreMatcher(patterns, 2)]) {
    assert.equal(match('build/output.ts'), true)
    assert.equal(match('build/keep.ts'), false)
    assert.equal(match('other/source.ts'), false)
    assert.equal(match('keep.tmp'), true)
    assert.equal(match('build\\output.ts'), true)
    // Repeat after cache eviction to check that the answer is unchanged.
    assert.equal(match('build/keep.ts'), false)
  }
})

test('cached decisions avoid repeated regex work and rule changes use a new matcher', () => {
  const { createGitignoreMatcher } = context.exports
  let calls = 0
  const patterns = [{ negation: false, dirOnly: false, regex: { test: () => { calls++; return true } } }]
  const match = createGitignoreMatcher(patterns)
  assert.equal(match('a.ts'), true)
  assert.equal(match('a.ts'), true)
  assert.equal(calls, 1)
  assert.equal(createGitignoreMatcher(parseGitignore('!a.ts'))('a.ts'), false)
})

test('global filters match shared name, root path and wildcard cases without parsing ignore files', () => {
  const { parseFilterRules, createGitignoreMatcher } = context.exports
  for (const { rules, hidden, visible } of require('./fixtures/file-filter.json')) {
    const matches = createGitignoreMatcher(parseFilterRules(rules.join('\n')))
    for (const path of hidden) assert.equal(matches(path), true, JSON.stringify({ rules, path }))
    for (const path of visible) assert.equal(matches(path), false, JSON.stringify({ rules, path }))
  }
})
