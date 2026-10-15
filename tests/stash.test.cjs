const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')

const compiled = ts.transpileModule(fs.readFileSync('src/utils/stash.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const context = { exports: {}, crypto: { randomUUID: () => 'test-id' } }
vm.runInNewContext(compiled, context)
const { buildPatch, createStashId, parseUnifiedDiff, parseUnifiedDiffFiles } = context.exports

const diff = [
  'Index: src/example.txt',
  '===================================================================',
  '--- src/example.txt\t(revision 1)',
  '+++ src/example.txt\t(working copy)',
  '@@ -1,2 +1,2 @@',
  '-first',
  '+changed first',
  ' second',
  '@@ -10,2 +10,2 @@',
  '-tenth',
  '+changed tenth',
  ' eleventh',
  '',
].join('\n')

test('parses independent hunks and stable selection IDs', () => {
  const file = parseUnifiedDiff('src/example.txt', diff)
  assert.ok(file)
  assert.equal(file.hunks.length, 2)
  assert.equal(file.hunks.map(hunk => hunk.id).join(','), 'src/example.txt::0,src/example.txt::1')
})

test('builds a patch containing only selected hunks and the required file header', () => {
  const file = parseUnifiedDiff('src/example.txt', diff)
  const patch = buildPatch([file], new Set(['src/example.txt::1']))
  assert.match(patch, /Index: src\/example\.txt/)
  assert.doesNotMatch(patch, /changed first/)
  assert.match(patch, /changed tenth/)
  assert.ok(patch.endsWith('\n'))
})

test('ignores non-text diffs and returns an empty patch for an empty selection', () => {
  assert.equal(parseUnifiedDiff('image.png', 'Cannot display: file marked as a binary type.'), null)
  assert.equal(buildPatch([], new Set()), '')
  assert.equal(createStashId(), 'test-id')
})

test('directory patches keep each file header and exclude unselected property changes', () => {
  const directoryDiff = diff + diff.replaceAll('src/example.txt', 'src/second.txt') + [
    '', 'Property changes on: src/second.txt',
    '___________________________________________________________________',
    'Added: test:property', '## -0,0 +1 ##', '+value',
    '\\ No newline at end of property', '',
    'Index: src', '===================================================================',
    'Property changes on: src', 'Added: test:directory', '+directory-value', '',
  ].join('\n')
  const files = parseUnifiedDiffFiles('src', directoryDiff)
  assert.equal(files.length, 2)
  assert.equal(files[1].path, 'src/second.txt')
  const patch = buildPatch(files, new Set(['src/second.txt::1']))
  assert.match(patch, /Index: src\/second.txt/)
  assert.doesNotMatch(patch, /src\/example.txt|changed first|Property changes|test:property|directory-value/)
  assert.match(patch, /changed tenth/)
})

test('preserves zero-length ranges and no-newline markers without swallowing property diffs', () => {
  const text = [
    'Index: new.txt', '--- new.txt\t(nonexistent)', '+++ new.txt\t(working copy)',
    '@@ -0,0 +1 @@', '+content', '\\ No newline at end of file', '',
    'Property changes on: new.txt', 'Added: test:property', '## -0,0 +1 ##', '+value', '',
  ].join('\n')
  const file = parseUnifiedDiff('new.txt', text)
  const patch = buildPatch([file], new Set(['new.txt::0']))
  assert.match(patch, /\\ No newline at end of file/)
  assert.doesNotMatch(patch, /Property changes|test:property|value/)
  assert.equal(file.hunks[0].added, 1)
})

test('Windows directory and child diffs share the same file and hunk identifiers', () => {
  const windowsDiff = diff.replaceAll('src/example.txt', 'src\\example.txt')
  const file = parseUnifiedDiffFiles('src', windowsDiff)[0]
  assert.equal(file.path, 'src/example.txt')
  assert.equal(file.hunks[0].id, 'src/example.txt::0')
  assert.equal(file.hunks[0].id, parseUnifiedDiff('src/example.txt', diff).hunks[0].id)
})

test('a selected directory hunk reverses and reapplies only its own file in a real working copy', t => {
  const { execFileSync, spawnSync } = require('node:child_process')
  const os = require('node:os')
  const path = require('node:path')
  const { pathToFileURL } = require('node:url')
  if (['svn', 'svnadmin'].some(cmd => spawnSync(cmd, ['--version']).status !== 0)) {
    t.skip('svn and svnadmin are required')
    return
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orcasvn-stash-patch-'))
  try {
    const repo = path.join(root, 'repo'), wc = path.join(root, 'wc')
    execFileSync('svnadmin', ['create', repo])
    execFileSync('svn', ['checkout', pathToFileURL(repo).href, wc])
    const svn = args => execFileSync('svn', ['--non-interactive', ...args], { cwd: wc, encoding: 'utf8' })
    fs.mkdirSync(path.join(wc, 'dir'))
    fs.writeFileSync(path.join(wc, 'dir/a.txt'), 'first\n')
    fs.writeFileSync(path.join(wc, 'dir/b.txt'), 'second\n')
    svn(['add', 'dir'])
    svn(['commit', '-m', 'initial'])
    svn(['propset', 'test:property', 'keep', 'dir'])
    fs.writeFileSync(path.join(wc, 'dir/a.txt'), 'first changed\n')
    fs.writeFileSync(path.join(wc, 'dir/b.txt'), 'second changed\n')
    const files = parseUnifiedDiffFiles('dir', svn(['diff', '--', 'dir']))
    const patch = buildPatch(files, new Set(['dir/b.txt::0']))
    const patchPath = path.join(root, 'selected.patch')
    fs.writeFileSync(patchPath, patch)
    svn(['patch', '--reverse-diff', patchPath])
    assert.equal(fs.readFileSync(path.join(wc, 'dir/a.txt'), 'utf8'), 'first changed\n')
    assert.equal(fs.readFileSync(path.join(wc, 'dir/b.txt'), 'utf8'), 'second\n')
    assert.equal(svn(['propget', 'test:property', 'dir']).trim(), 'keep')
    svn(['patch', patchPath])
    assert.equal(fs.readFileSync(path.join(wc, 'dir/b.txt'), 'utf8'), 'second changed\n')
    assert.equal(svn(['propget', 'test:property', 'dir']).trim(), 'keep')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
