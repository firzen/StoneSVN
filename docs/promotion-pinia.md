StoneSVN is an MIT-licensed SVN desktop client for Windows, macOS and Linux, developed from OrcaSVN with Vue 3, Pinia, Tauri 2 and Rust.

One concrete Pinia use case is keeping multiple working copies in the same desktop workspace:

- The workspace store holds the active path, SVN information, status list and computed counts.
- Commit drafts are keyed by working-copy path, so switching projects can retain each project's message and selection during the session.
- Recent working copies and summary counts are persisted locally, while a stale-status flag distinguishes cached data from newly checked status.
- The stash store persists the next entry set before updating its reactive state, so a local storage failure does not make the UI claim the patch was saved.

These are application-specific stores, not a new Pinia persistence plugin. The Rust backend runs the SVN CLI; the Vue UI calls it through Tauri commands.

[Workspace store source](https://github.com/firzen/StoneSVN/blob/v1.1.2/src/stores/workspace.ts) · [Stash store source](https://github.com/firzen/StoneSVN/blob/v1.1.2/src/stores/stash.ts)

[Project and installers](https://github.com/firzen/StoneSVN) · [English introduction](https://stonesvn.github.io/en/) · [Practical stashing guide](https://stonesvn.github.io/en/guides/svn-stash-selected-hunks/)

SVN must be installed separately. General Merge, Switch and line-by-line Blame interfaces are not available. macOS builds are ad-hoc signed and not notarized.

Feedback from people building multi-project desktop apps with Pinia would be useful, especially around separating session-only drafts from persisted workspace metadata.

Self-submission prepared with AI assistance.
