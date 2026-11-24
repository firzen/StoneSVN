const { spawnSync } = require('node:child_process')
const { realpathSync, statSync } = require('node:fs')
const path = require('node:path')

const [runtimeArgument, ...buildArguments] = process.argv.slice(2)
if (!runtimeArgument) {
  console.error('Usage: npm run build:with-svn -- <svn-runtime-directory> [Tauri build options]')
  process.exit(1)
}

const runtime = realpathSync(runtimeArgument)
const executable = path.join(runtime, process.platform === 'win32' ? 'svn.exe' : 'svn')
if (!statSync(path.join(runtime, 'licenses')).isDirectory()) {
  throw new Error('The SVN runtime must include a licenses directory')
}

const probe = spawnSync(executable, ['--version', '--quiet'], {
  encoding: 'utf8',
  timeout: 10000,
  windowsHide: true,
})
if (probe.error) throw probe.error
if (probe.status !== 0 || !/^1\.(?:14|15)\.\d+(?:-SlikSvn)?$/.test(probe.stdout.trim())) {
  throw new Error(`Expected a runnable Subversion 1.14 or 1.15 client: ${probe.stderr || probe.stdout}`)
}

const config = JSON.stringify({ bundle: { resources: { [runtime]: 'svn-runtime/' } } })
const tauri = require.resolve('@tauri-apps/cli/tauri.js')
const build = spawnSync(process.execPath, [tauri, 'build', ...buildArguments, '--config', config], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
})
if (build.error) throw build.error
process.exitCode = build.status ?? 1
