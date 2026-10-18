Hi everyone — sharing **StoneSVN**, an MIT-licensed SVN desktop client built with **Tauri 2, Rust and Vue 3**, developed from [OrcaSVN](https://github.com/wustites/OrcaSVN).

It is for developers who still work with Subversion and want working-copy switching, diff review and selective commits in one workspace. It also supports local shelving of selected text hunks, commit/file history, global ignore rules, and light/dark themes.

Some implementation details that may interest Tauri developers:

- The Vue frontend calls Rust commands through Tauri's `invoke` API. Rust executes the user's locally installed SVN CLI rather than implementing the SVN protocol.
- The subprocess layer uses Tokio with a timeout, piped stdout/stderr and `kill_on_drop`. On Unix, it sets the child process locale for UTF-8 SVN output, which matters when launching from the desktop.
- The UI groups changed, unversioned, conflicted and missing files, while keeping commit drafts and selections per working copy within the current session.

Relevant source: [SVN process execution](https://github.com/firzen/StoneSVN/blob/v1.1.2/src-tauri/src/svn/executor.rs) and [frontend command bindings](https://github.com/firzen/StoneSVN/blob/v1.1.2/src/api/svn.ts).

- Website and screenshots: https://stonesvn.github.io/en/
- Source: https://github.com/firzen/StoneSVN
- Downloads: https://github.com/firzen/StoneSVN/releases/latest

The current release is v1.1.2, with Windows, Linux, and macOS Apple Silicon/Intel packages. Install SVN CLI separately. macOS builds are ad-hoc signed and not notarized; general Merge, Switch and line-by-line Blame interfaces are not available.

Feedback on the packaged-app setup and the working-copy review flow would be welcome. This project introduction was prepared with AI assistance and checked against the repository; it does not report a new cross-platform test run.
