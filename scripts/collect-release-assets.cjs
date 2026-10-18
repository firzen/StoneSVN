const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const version = require('../package.json').version
const output = path.resolve('release-assets')
const expected = {
  'ubuntu-22.04': [`StoneSVN_${version}_amd64.AppImage`, `StoneSVN_${version}_amd64.deb`, `StoneSVN-${version}-1.x86_64.rpm`],
  'windows-latest': [`StoneSVN_${version}_x64-setup.exe`, `StoneSVN_${version}_x64_en-US.msi`],
  'macos-15': [`StoneSVN_${version}_aarch64.dmg`, 'StoneSVN_aarch64.app.tar.gz'],
  'macos-15-intel': [`StoneSVN_${version}_x64.dmg`, 'StoneSVN_x64.app.tar.gz'],
}
function verify(names, wanted) {
  if (names.length !== wanted.length || wanted.some(name => !names.includes(name))) {
    throw new Error(`Unexpected assets: ${JSON.stringify(names)}; expected ${JSON.stringify(wanted)}`)
  }
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(file) : [file]
  })
}
if (require.main === module) {
  const all = Object.values(expected).flat()
  if (process.argv[2] === '--verify-upload') {
    const assets = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).assets
    verify(assets.map(asset => asset.name), all)
    for (const asset of assets) {
      if (asset.state !== 'uploaded' || asset.size !== fs.statSync(path.join(output, asset.name)).size) {
        throw new Error(`Incomplete uploaded asset: ${asset.name}`)
      }
    }
  } else if (process.argv[2] === '--verify') {
    verify(fs.readdirSync(output), all)
    for (const name of all) if (!fs.statSync(path.join(output, name)).size) throw new Error(`Empty asset: ${name}`)
  } else {
    const platform = process.env.RELEASE_PLATFORM
    const wanted = expected[platform]
    if (!wanted) throw new Error('Unsupported RELEASE_PLATFORM')
    fs.mkdirSync(output, { recursive: true })
    const target = platform === 'macos-15' ? 'aarch64-apple-darwin' : platform === 'macos-15-intel' ? 'x86_64-apple-darwin' : ''
    const bundle = path.join('src-tauri/target', target, 'release/bundle')
    for (const name of wanted) {
      if (name.endsWith('.app.tar.gz')) {
        execFileSync('tar', ['-czf', path.join(output, name), '-C', path.join(bundle, 'macos'), 'StoneSVN.app'])
      } else {
        const matches = walk(bundle).filter(file => path.basename(file) === name)
        if (matches.length !== 1) throw new Error(`Expected one ${name}, found ${matches.length}`)
        fs.copyFileSync(matches[0], path.join(output, name))
      }
    }
    verify(fs.readdirSync(output), wanted)
    for (const name of wanted) if (!fs.statSync(path.join(output, name)).size) throw new Error(`Empty asset: ${name}`)
  }
  console.log('Validated release assets')
}
module.exports = { verify }
