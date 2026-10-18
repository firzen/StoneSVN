# StoneSVN — an open-source SVN workspace built with Tauri, Rust and Vue

StoneSVN is an MIT-licensed SVN desktop client for Windows, macOS and Linux, developed from [OrcaSVN](https://github.com/wustites/OrcaSVN) with Tauri 2, Rust and Vue 3.

The use case is everyday work on projects that still use Subversion: switch between working copies, review diffs, then choose the files or directories to commit. Local shelving can save selected text hunks when a change is not ready to commit. There are also file history, SVN property editing, ignore rules and light/dark themes.

This fork focuses on the review-and-commit workflow, including keeping each working copy's commit selection and draft while moving between projects. Feedback from people using SVN across different operating systems would be useful: where does selecting and reviewing a commit still feel awkward?

- [Source and installers](https://github.com/firzen/StoneSVN)
- [English introduction](https://stonesvn.github.io/en/)
- [English README](https://github.com/firzen/StoneSVN/blob/main/README.en.md)

![StoneSVN workspace](https://raw.githubusercontent.com/firzen/StoneSVN/v1.1.2/docs/images/orcasvn-workspace.png)

Current release: v1.1.2. SVN CLI must be installed separately. macOS builds are ad-hoc signed and not notarized. General Merge, Switch and line-by-line Blame interfaces are not available yet.

Self-submission; this introduction was prepared with AI assistance.
