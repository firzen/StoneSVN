# Development environment

English | [简体中文](SETUP.zh-CN.md)

## Prerequisites

Install and verify Node.js, Rust, and the SVN CLI:

```bash
node --version
npm --version
rustc --version
cargo --version
svn --version --quiet
```

Windows also requires Visual Studio C++ Build Tools and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for Linux and macOS system dependencies.

## Start the application

```bash
npm ci
npm run tauri dev
```

For frontend-only debugging, run `npm run dev`. SVN operations require the Tauri backend.

## Validate changes

```bash
npm run check
```

This checks frontend types and builds, runs frontend unit tests, checks Rust formatting, and runs Rust tests.

## Release build

```bash
npm run tauri build
```

Installers and binaries are written under `src-tauri/target/release/`. See the [stable release workflow](docs/releasing.md) for version preparation, validation, packaging, and publication. Prerelease tags such as `v0.6.3-rc.1` use a separate workflow described in [prereleases](docs/prerelease.md).

## Troubleshooting

### SVN cannot be found

At startup, StoneSVN validates an explicitly configured path first. Otherwise, it searches PATH and common locations:

- Windows: standard SlikSVN, TortoiseSVN, VisualSVN, and CollabNet directories, plus Chocolatey, Scoop, and user installation directories.
- macOS: Homebrew (`/opt/homebrew/bin/svn`, `/usr/local/bin/svn`), MacPorts (`/opt/local/bin/svn`), and system directories.
- Linux: `/usr/bin/svn`, `/usr/local/bin/svn`, `/bin/svn`, `/snap/bin/svn`, `/opt/subversion/bin/svn`, and `~/.local/bin/svn`.

If discovery fails, the Configure SVN Path dialog appears. Install the CLI, then enter its full executable path or use Browse to select `svn.exe` on Windows or `svn` on macOS/Linux. An installation directory or workspace directory is not valid. Select Validate and Continue; workspaces load only after validation, and invalid settings are not saved. You can also retry automatic discovery.

The executable can also be set in Settings. A common Homebrew path on Intel Macs is `/usr/local/bin/svn`.

### Windows compilation fails

Use the Rust MSVC toolchain and install Visual Studio's Desktop development with C++ workload.

### Port 1420 is in use

The development server requires port 1420. Stop the process using it, then run `npm run tauri dev` again.
