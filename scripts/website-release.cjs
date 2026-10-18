const fs = require('node:fs')
const path = require('node:path')
const { validateRelease } = require('./validate-release.cjs')
const { readVersions } = require('./validate-prerelease.cjs')
const languages = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko']
function readNotes(tag, root = process.cwd()) {
  validateRelease(tag, readVersions(root))
  if (!fs.readFileSync(path.join(root, `docs/releases/${tag}.md`), 'utf8').trim()) throw new Error('Missing release notes')
  const notes = JSON.parse(fs.readFileSync(path.join(root, `docs/releases/${tag}.website.json`), 'utf8'))
  for (const lang of languages) {
    const entry = notes[lang]
    if (!entry || typeof entry.title !== 'string' || !entry.title.trim() || !Array.isArray(entry.items) || !entry.items.length || entry.items.some(item => typeof item !== 'string' || !item.trim())) {
      throw new Error(`Missing website release notes for ${lang}`)
    }
  }
  return notes
}
function createManifest(tag, release, sha, notes) {
  const url = `https://github.com/firzen/StoneSVN/releases/tag/${tag}`
  if (release.tag_name !== tag || release.draft || release.prerelease || release.html_url !== url || !/^\d{4}-\d\d-\d\dT/.test(release.published_at || '') || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('Website sync requires a published stable release and exact source SHA')
  }
  return { tag, version: tag.slice(1), url, publishedAt: release.published_at, sourceSha: sha, notes }
}
if (require.main === module) {
  const [, , command, tag, releaseFile, sha, destination] = process.argv
  const notes = readNotes(tag)
  if (command === 'sync') {
    const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'))
    const manifest = createManifest(tag, release, sha, notes)
    fs.writeFileSync(destination, JSON.stringify(manifest, null, 2) + '\n')
  } else if (command !== 'validate') throw new Error('Use validate TAG or sync TAG RELEASE_JSON SHA DESTINATION')
  console.log(`Validated website metadata for ${tag}`)
}
module.exports = { readNotes, createManifest }
