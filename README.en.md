# StoneSVN

[Official website](https://stonesvn.github.io)

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | English | [日本語](README.ja.md) | [한국어](README.ko.md)

StoneSVN is an open-source SVN desktop client for Windows, macOS, and Linux, released under the MIT license. It organizes daily work around reviewing changes, inspecting diffs, and choosing what to commit, with multiple working copies, directory-based commit selection, and local stashes of selected text hunks in one workspace.

Built with Tauri, Rust, and Vue 3, it uses the local SVN CLI and preserves SVN's centralized version-control model.

[Download installers](https://github.com/firzen/StoneSVN/releases) · [Quick start](QUICKSTART.md) · [User guide](docs/user-guide.md) · [Compare with Cornerstone](#comparison-with-cornerstone)

![StoneSVN application interface](docs/images/orcasvn-workspace.png)

Development UI from the current source, captured on 2026-10-18 with fictional projects, paths, and diffs. No real repository or personal data is shown. [Dark theme](docs/images/orcasvn-workspace-dark.png).

Current stable version: **1.1.0**. See the [release notes](docs/releases/v1.1.0.md), [release workflow](docs/releasing.md), and [performance comparison with v0.6.2](docs/workspace-startup-benchmark.md).

## Highlights

- **Cross-platform and open source:** One workspace across Windows, macOS, and Linux, with MIT-licensed source, light and dark themes, and Simplified Chinese, Traditional Chinese, English, Japanese, and Korean translations.
- **Multiple working copies:** Switch projects from a persistent, reorderable, resizable sidebar. Commit drafts, selections, and filters are retained per project during the current session.
- **Explicit commit scope:** Select files or directories independently, include descendants, or use Shift to select a range. Selected items hidden by search remain counted; returning from a diff preserves the selection and commit message.
- **Stash selected text hunks:** Save whole files or selected text changes locally and restore them to the original working copy. Keep the stash after applying, or remove it after a successful restore. Text patches can be copied or exported.
- **Review changes and history:** Group changed, unversioned, conflicted, and missing files; preview text diffs and images; browse the commit timeline, paginated file history, historical diffs, and adjacent revisions.
- **Properties and file actions:** Find files through a project tree and recursive search, edit common SVN and custom text properties, export working-copy content without `.svn`, or restore a clean versioned file to a specified revision. Property edits and restored content require a separate commit.
- **Global ignore rules:** Configure file filtering in Settings and enable it for all working copies. Use `*`, `?`, and `**` wildcards to hide matching entries, with scope checks when adding and committing to help prevent accidental inclusion of temporary files.

Cached workspaces display the previous list first, then validate the current state. A visible cache notice and restrictions on related changes remain until validation completes. See the [historical performance measurements and their limits](docs/workspace-startup-benchmark.md).

## Comparison with Cornerstone

StoneSVN focuses on working-copy review, selective commits, and saving unfinished changes across operating systems. Branch merging and line-by-line author annotations require other SVN tools.

| Capability | StoneSVN today | Cornerstone 4 official description |
| --- | --- | --- |
| Platforms | Windows, macOS, Linux | macOS |
| Working copies and commits | Project sidebar, status groups, file/directory selection | Working-copy browser, commit diff review |
| Text and images | Text diffs, image previews | Text and image comparison |
| History | Commit timeline, file history, revision diffs | Log, Timeline, line annotations |
| Save unfinished changes | Local stashes by file or text hunk | Shelving, Checkpointing |
| Branch merging | No general-purpose Merge UI yet | Multiple merge strategies and change previews |

Sources: [Cornerstone features](https://cornerstone.assembla.com/) and its [Shelving / Checkpointing guide](https://cornerstone.assembla.com/cornerstone/helpbook/pages/working/shelving.html), checked on 2026-10-17. This compares official documentation with the current StoneSVN source; it is not a performance benchmark between the two clients.

StoneSVN's history view does not provide line-by-line Blame, and image previews do not compare image revisions. Local stashes store patches and unversioned file content in the application; they do not interoperate with native SVN shelves or provide Cornerstone-style versioned checkpoints.

> StoneSVN uses the locally installed `svn` command-line tool; it does not implement the SVN protocol itself.

Switch and general-purpose Merge still require another SVN client or the command line. Conflict actions now support keeping manually resolved content or choosing the local/repository version; directory and tree conflicts require manual file organization first. Properties supports rename/move with history, recursive revert with an affected-file preview, restoring clean files or directories to a revision, and adding or cancelling plain additions while retaining local files. Rename, move, property edits and restored content need a separate commit. Repository relocation supports address changes within the same repository.

## Installation

Download installers for Windows, macOS, and Linux from [GitHub Releases](https://github.com/firzen/StoneSVN/releases).

For macOS, choose the `x64` DMG for an Intel Mac or `aarch64` for an Apple Silicon Mac. Check About This Mac if unsure.

macOS builds use free ad-hoc signing and are not notarized by Apple. Drag StoneSVN into Applications. If the first launch is blocked, go to System Settings → Privacy & Security → Open Anyway, then confirm Open. Managed Macs may require IT approval. See the [macOS build and distribution guide (Chinese)](docs/macos-distribution.md).

The app uses an external SVN CLI. On Windows, multilingual paths and property values depend on that CLI’s Unicode and code-page support.

After installation, make sure the SVN CLI is available:

```bash
svn --version --quiet
```

## Quick Start

1. Open StoneSVN and use Add Local Copy at the bottom of the project sidebar, or Add Remote Copy to check out a repository.
2. Filter files in the workspace by changed, unversioned, conflicted, or missing status.
3. Select a file to inspect its diff, then review and commit your changes from the Commit page.
4. Run Update before committing and resolve any conflicts first.

For usage instructions, see the [quick start](QUICKSTART.md) and [user guide](docs/user-guide.md) (Simplified Chinese).

## Global Ignore Rules

Enable file filtering in Settings and enter one rule per line. All working copies share these rules. For example:

```text
.gitignore
*.log
/_tmp1010/log*
**/node_modules
```

Names without `/` match at any depth; paths containing `/` match from each working-copy root. `*` does not cross directories, `?` matches one character, and `**` can cross directories. Matching a directory includes all descendants. Negation with `!` is not supported.

These are application-level filters; they do not change SVN's `svn:ignore` or `svn:global-ignores` properties. The default rule only matches the `.gitignore` file itself and does not read its contents. Add and commit actions also check the filter scope. Recursively adding a directory containing filtered items prompts for individual adds or a rule adjustment.

## Properties and File History

The Properties page provides a project tree, recursive file search, and SVN property editing. Export a versioned file or directory, including local edits and excluding `.svn` metadata, to a new destination directory. Schedule deletion or restore a clean versioned file to a specified revision, then review and commit the local changes separately. The file history view lists revisions; double-click a revision to inspect its diff.

![Properties and file actions with fictional data](docs/images/stonesvn-properties.png)

[Dark theme](docs/images/stonesvn-properties-dark.png).

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
