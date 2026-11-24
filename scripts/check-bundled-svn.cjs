const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const [clientPath, adminPath] = process.argv.slice(2)
if (!clientPath || !adminPath) {
  throw new Error('Usage: node scripts/check-bundled-svn.cjs <svn-path> <svnadmin-path>')
}

const windows = process.platform === 'win32'
const root = mkdtempSync(path.join(os.tmpdir(), 'stonesvn-bundled-'))
const work = path.join(root, 'working copy')
const secondWork = path.join(root, 'second working copy')
const repo = path.join(root, 'repository')
const config = path.join(root, 'config')
const relativeFile = '中文@name.txt'
const pegEscaped = `${relativeFile}@`
const client = path.resolve(clientPath)

function svn(args, cwd = root) {
  return execFileSync(client, ['--non-interactive', '--config-dir', config, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
    env: {
      ...process.env,
      PATH: windows ? path.join(process.env.SystemRoot, 'System32') : '/usr/bin:/bin',
      LC_ALL: process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8',
    },
  })
}

try {
  assert.match(svn(['--version', '--quiet']), /^1\.(?:14|15)\.\d+(?:-SlikSvn)?\s*$/)
  execFileSync(path.resolve(adminPath), ['create', repo], { timeout: 30000 })
  svn(['checkout', pathToFileURL(repo).href, work])
  svn(['checkout', pathToFileURL(repo).href, secondWork])
  const content = 'initial content\n'
  writeFileSync(path.join(work, relativeFile), content)
  svn(['add', '--', pegEscaped], work)
  const value = '中文 *\nsecond line'
  const propertyFile = path.join(root, 'property.txt')
  writeFileSync(propertyFile, value)
  svn(['propset', 'stone:test', '--file', propertyFile, '--', pegEscaped], work)
  svn(['commit', '-m', 'Smoke test', '--', pegEscaped], work)
  svn(['update'], secondWork)
  assert.equal(readFileSync(path.join(secondWork, relativeFile), 'utf8'), content)
  assert.equal(svn(['propget', '--strict', 'stone:test', '--', pegEscaped], secondWork), value)
  assert.doesNotMatch(svn(['status', '--xml'], secondWork), /<entry/)
  console.log('Bundled SVN passed checkout, add, properties, commit, update and status.')
} finally {
  rmSync(root, { recursive: true, force: true })
}
