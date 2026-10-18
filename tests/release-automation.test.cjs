const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { readVersions } = require('../scripts/validate-prerelease.cjs')
const { createManifest, readNotes } = require('../scripts/website-release.cjs')
const { verify } = require('../scripts/collect-release-assets.cjs')
const root = path.resolve(__dirname, '..')
const tag = 'v1.2.3'
const sampleNotes = Object.fromEntries(['en', 'zh-CN', 'zh-TW', 'ja', 'ko'].map(lang => [lang, { title: 'Release', items: ['A reviewed change'] }]))
const currentVersion = require('../package.json').version

test('website synchronization rejects drafts, prereleases, wrong tags and unpinned sources', () => {
  const release = { tag_name: tag, html_url: `https://github.com/firzen/StoneSVN/releases/tag/${tag}`, published_at: '2026-10-18T00:00:00Z', draft: false, prerelease: false }
  const sha = 'a'.repeat(40)
  const manifest = createManifest(tag, release, sha, sampleNotes)
  assert.equal(manifest.sourceSha, sha)
  for (const patch of [{ draft: true }, { prerelease: true }, { tag_name: 'v0.0.0' }, { html_url: 'https://example.com' }, { published_at: null }]) {
    assert.throws(() => createManifest(tag, { ...release, ...patch }, sha, {}))
  }
  assert.throws(() => createManifest(tag, release, 'main', {}))
})

test('asset gate rejects missing, extra and duplicate installers', () => {
  verify(['one', 'two'], ['two', 'one'])
  assert.throws(() => verify(['one'], ['one', 'two']))
  assert.throws(() => verify(['one', 'one'], ['one', 'two']))
  assert.throws(() => verify(['one', 'two', 'three'], ['one', 'two']))
})

test('release preparation updates all version sources and refuses incomplete notes before writing', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'stonesvn-release-'))
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }))
  for (const file of ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json', 'scripts/prepare-release.cjs', 'scripts/validate-release.cjs', 'scripts/validate-prerelease.cjs', 'scripts/website-release.cjs']) {
    const dest = path.join(fixture, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(path.join(root, file), dest)
    // Git for Windows checks TOML/lock files out with CRLF by default.
    if (file === 'src-tauri/Cargo.lock' || file.endsWith('.toml')) {
      fs.writeFileSync(dest, fs.readFileSync(dest, 'utf8').replace(/\r?\n/g, '\r\n'))
    }
  }
  const version = '99.0.0'
  const run = value => execFileSync(process.execPath, ['scripts/prepare-release.cjs', value], { cwd: fixture, stdio: 'pipe' })
  assert.throws(() => run('01.0.0'))
  assert.throws(() => run(version))
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture, 'package.json'))).version, currentVersion)
  const notesDir = path.join(fixture, 'docs/releases')
  fs.mkdirSync(notesDir, { recursive: true })
  fs.writeFileSync(path.join(notesDir, `v${version}.md`), ' \n\t')
  fs.writeFileSync(path.join(notesDir, `v${version}.website.json`), JSON.stringify(sampleNotes))
  assert.throws(() => run(version), /nonempty release notes/)
  assert.deepEqual(new Set(Object.values(readVersions(fixture))), new Set([currentVersion]))
  fs.writeFileSync(path.join(notesDir, `v${version}.md`), '# Release\n')
  run(version)
  const check = () => execFileSync(process.execPath, ['scripts/website-release.cjs', 'validate'], { cwd: fixture, stdio: 'pipe' })
  assert.match(check().toString(), /Validated website metadata for v99\.0\.0/)
  assert.deepEqual(new Set(Object.values(readVersions(fixture))), new Set([version]))
  assert.deepEqual(readNotes(`v${version}`, fixture), sampleNotes)
  fs.writeFileSync(path.join(notesDir, `v${version}.website.json`), JSON.stringify({ en: sampleNotes.en }))
  assert.throws(() => readNotes(`v${version}`, fixture), /Missing website release notes/)
  assert.throws(check, /Missing website release notes/)
  assert.throws(() => run(version))
  assert.throws(() => run('98.0.0'))
})
