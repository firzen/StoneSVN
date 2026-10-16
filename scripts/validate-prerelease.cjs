const fs = require('node:fs')
const path = require('node:path')

function validatePrerelease(tag, versions) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-(alpha|beta|rc)\.(0|[1-9]\d*)$/.test(tag || '')) {
    throw new Error('Use a prerelease tag such as v0.6.3-rc.1 (alpha, beta or rc).')
  }
  const version = tag.slice(1)
  for (const [file, actual] of Object.entries(versions)) {
    if (actual !== version) throw new Error(`${file}: expected ${version}, found ${actual}`)
  }
  return version
}

function readVersions(root = process.cwd()) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8')
  const json = file => JSON.parse(read(file))
  const lock = json('package-lock.json')
  const cargo = read('src-tauri/Cargo.toml').split('[package]')[1]?.split(/\n\[/)[0]
  const cargoLock = read('src-tauri/Cargo.lock').split('[[package]]')
    .find(block => /^name = "StoneSVN"$/m.test(block))
  return {
    'package.json': json('package.json').version,
    'package-lock.json': lock.version,
    'package-lock.json root package': lock.packages?.['']?.version,
    'src-tauri/tauri.conf.json': json('src-tauri/tauri.conf.json').version,
    'src-tauri/Cargo.toml': cargo?.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    'src-tauri/Cargo.lock': cargoLock?.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  }
}

if (require.main === module) {
  const version = validatePrerelease(process.env.RELEASE_TAG, readVersions())
  console.log(`Validated prerelease ${version}`)
}

module.exports = { validatePrerelease, readVersions }
