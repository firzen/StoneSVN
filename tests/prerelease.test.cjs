const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { validatePrerelease, readVersions } = require('../scripts/validate-prerelease.cjs')

test('accepts alpha, beta and rc tags when all package versions match', () => {
  for (const channel of ['alpha', 'beta', 'rc']) {
    const version = `0.6.3-${channel}.1`
    assert.equal(validatePrerelease(`v${version}`, { npm: version, tauri: version, cargo: version }), version)
  }
})

test('reads every version source with Windows line endings and ignores dependency versions', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orcasvn-prerelease-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'src-tauri'))
  const version = '0.6.3-rc.1'
  const write = (file, value) => fs.writeFileSync(path.join(root, file), value)
  write('package.json', JSON.stringify({ version }))
  write('package-lock.json', JSON.stringify({ version, packages: { '': { version } } }))
  write('src-tauri/tauri.conf.json', JSON.stringify({ version }))
  write('src-tauri/Cargo.toml', `[package]\r\nname = "StoneSVN"\r\nversion = "${version}"\r\n[dependencies]\r\nversion = "2"\r\n`)
  write('src-tauri/Cargo.lock', `[[package]]\r\nname = "dependency"\r\nversion = "2"\r\n[[package]]\r\nname = "StoneSVN"\r\nversion = "${version}"\r\n`)
  assert.equal(Object.keys(readVersions(root)).length, 6)
  assert.equal(validatePrerelease(`v${version}`, readVersions(root)), version)
  write('src-tauri/Cargo.lock', '[[package]]\nname = "dependency"\nversion = "2"\n')
  assert.throws(() => validatePrerelease(`v${version}`, readVersions(root)), /Cargo.lock: expected/)
})

test('rejects stable, malformed and unsupported prerelease tags', () => {
  for (const tag of ['v0.6.3', '0.6.3-rc.1', 'v0.6.3-rc', 'v0.6.3-rc.01', 'v00.6.3-beta.1', 'v0.6.3-preview.1']) {
    assert.throws(() => validatePrerelease(tag, {}), /prerelease tag/)
  }
})

test('rejects mismatched or missing package versions before publication', () => {
  for (const actual of ['0.6.2', undefined]) {
    assert.throws(() => validatePrerelease('v0.6.3-rc.1', { cargo: actual }), /cargo: expected/)
  }
})
