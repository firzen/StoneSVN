# StoneSVN

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | English | [日本語](README.ja.md) | [한국어](README.ko.md)

StoneSVN is a cross-platform SVN desktop client built with Tauri, Rust, and Vue 3. It brings the clarity of a Git-style working-copy experience to SVN while preserving its centralized version-control model.

![StoneSVN application interface](docs/images/orcasvn-workspace.png)

Development UI from the current source, captured on 2026-10-16 with fictional projects, paths, and diffs. No real repository or personal data is shown. [Dark theme](docs/images/orcasvn-workspace-dark.png).

Current stable version: **0.6.4**. See the [release notes](docs/releases/v0.6.4.md), [release workflow](docs/releasing.md), and [performance comparison with v0.6.2](docs/workspace-startup-benchmark.md).

## Features

- Switch working copies from a persistent project sidebar, reorder projects, resize the sidebar, and access common actions from the top toolbar
- Preview text diffs and images, with external open actions for binary files and directories
- Browse file and directory properties in a project tree and edit common SVN properties and custom text properties; commit separately after applying
- View local changes, unversioned files, conflicts, and missing files in `git status`-style groups
- Check out, update, select files or directories to commit, add files, revert changes, and clean up working copies
- Save local changes in stashes by file or text hunk and restore them to the original workspace
- Browse commit history, inspect file diffs, and view line-by-line blame information
- Available in Simplified Chinese, Traditional Chinese, English, Japanese, and Korean
- Light and dark themes on Windows, macOS, and Linux

> StoneSVN uses the locally installed `svn` command-line tool; it does not implement the SVN protocol itself.

Switch, Merge, Resolve, and scheduling deletion of versioned files currently require another SVN client or the command line. Refresh StoneSVN afterward. The workspace Delete button removes unversioned local files.

## Installation

### Windows

```powershell
winget install OrcaSVN.OrcaSVN
```

You can also download installers for Windows, macOS, and Linux from [GitHub Releases](https://github.com/firzen/StoneSVN/releases).

After installation, make sure the SVN CLI is available:

```bash
svn --version --quiet
```

## Quick Start

1. Open StoneSVN and select an existing SVN working copy, or check out a repository.
2. Filter files in the workspace by changed, unversioned, conflicted, or missing status.
3. Select a file to inspect its diff, then review and commit your changes from the Commit page.
4. Run Update before committing and resolve any conflicts first.

For usage instructions, see the [quick start](QUICKSTART.md) and [user guide](docs/user-guide.md) (Simplified Chinese).

## Local Development

Requirements:

- Node.js 18 or later
- Latest stable Rust toolchain
- SVN CLI 1.10 or later
- Tauri 2 build dependencies for your platform

```bash
npm ci
npm run tauri dev
```

Before submitting changes, run:

```bash
npm run check
```

See [SETUP.md](SETUP.md) for environment setup and troubleshooting, and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Project Structure

```text
src/                    Vue 3 frontend
  api/                  Tauri command wrappers
  composables/          Reusable workspace logic
  i18n/                 Localization resources
  stores/               Pinia state
  views/                Application views
src-tauri/src/
  main.rs               Tauri command boundary
  svn/executor.rs       SVN process execution and timeouts
  svn/operations.rs     SVN argument construction
  svn/parser.rs         XML and text result parsing
.github/workflows/      Release workflows
```

## Design Principles

- **Predictable:** UI actions map to explicit SVN commands whenever possible.
- **Review before change:** Status and diffs are shown before committing or reverting changes.
- **Safe argument boundaries:** File targets are separated from command options with `--`.
- **Clear feedback:** Errors retain the original SVN context to make diagnosis easier.

## License

[MIT](LICENSE)
