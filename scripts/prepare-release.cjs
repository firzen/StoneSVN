// Prepare a version commit; tags are created only by the gated release workflow.
const fs = require('node:fs')
const { validateRelease } = require('./validate-release.cjs')
const { readVersions } = require('./validate-prerelease.cjs')
function prepare(version) {
  validateRelease(`v${version}`, {})
  const current = require('../package.json').version
  const parts = value => value.split('.').map(Number)
  const a = parts(version), b = parts(current.split('-')[0])
  const delta = a.findIndex((part, i) => part !== b[i])
  if ((delta < 0 && !current.includes('-')) || (delta >= 0 && a[delta] < b[delta])) throw new Error(`Version must be newer than ${current}`)
  const notes = `docs/releases/v${version}`
  for (const file of [`${notes}.md`, `${notes}.website.json`]) {
    if (!fs.existsSync(file)) throw new Error(`Write ${file} before preparing the release`)
  }
  const localized = JSON.parse(fs.readFileSync(`${notes}.website.json`, 'utf8'))
  for (const lang of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko']) {
    const note = localized[lang]
    if (!note?.title?.trim() || !Array.isArray(note.items) || !note.items.length || note.items.some(item => typeof item !== 'string' || !item.trim())) throw new Error(`Missing notes: ${lang}`)
  }
  for (const [file, actual] of Object.entries(readVersions())) {
    if (actual !== current) throw new Error(`${file}: inconsistent source version ${actual}`)
  }
  const changes = new Map()
  for (const file of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json']) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    data.version = version
    if (file === 'package-lock.json') data.packages[''].version = version
    changes.set(file, JSON.stringify(data, null, 2) + '\n')
  }
  const cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8')
  changes.set('src-tauri/Cargo.toml', cargo.replace(/(\[package\][\s\S]*?^version\s*=\s*")[^"]+/m, `$1${version}`))
  const lock = fs.readFileSync('src-tauri/Cargo.lock', 'utf8')
  changes.set('src-tauri/Cargo.lock', lock.replace(/(\[\[package\]\]\r?\nname = "StoneSVN"\r?\nversion = ")[^"]+/, `$1${version}`))
  for (const [file, content] of changes) fs.writeFileSync(file, content)
  validateRelease(`v${version}`, readVersions())
  console.log(`Prepared v${version}. Review and push the version commit to main; CI will check, build, tag, publish and sync the website.`)
}
if (require.main === module) prepare(process.argv[2])
