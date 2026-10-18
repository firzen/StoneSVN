const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(process.argv[2] || 'website')
const release = JSON.parse(fs.readFileSync(path.join(root, 'source/release.json'), 'utf8'))
for (const lang of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko']) {
  const html = fs.readFileSync(path.join(root, lang, 'index.html'), 'utf8')
  assert.ok(html.includes(`<html lang="${lang}">`))
  assert.ok(html.includes(`https://stonesvn.github.io/${lang}/`))
  assert.ok(html.includes('id="release-notes"'))
  assert.ok(html.includes(release.tag))
  assert.ok(html.includes(`"softwareVersion":"${release.version}"`))
  assert.ok(!html.includes('noindex'))
  for (const view of ['workspace-light', 'workspace-dark', 'properties']) {
    const image = fs.readFileSync(path.join(root, 'assets/screenshots', `${lang}-${view}.png`))
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(image.readUInt32BE(16), 1440)
    assert.equal(image.readUInt32BE(20), 900)
  }
  assert.ok(html.includes(`/assets/screenshots/${lang}-workspace-light.png?v=${release.sourceSha}`))
}
console.log(`Validated five static pages, release notes and 15 localized screenshots for ${release.tag}`)
