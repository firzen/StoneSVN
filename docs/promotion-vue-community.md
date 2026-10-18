Sharing **StoneSVN**, an open-source desktop application using **Vue 3, TypeScript, Pinia, Vue Router and vue-i18n**, with Tauri 2 and a Rust backend. It is developed from [OrcaSVN](https://github.com/wustites/OrcaSVN) and uses the MIT license.

The application is an SVN client for developers maintaining Subversion working copies. The main interaction is reviewing changed files and text diffs, choosing a commit scope, and keeping unfinished work in local shelves.

For Vue developers, the source provides a concrete desktop example of:

- Managing multiple working copies in a project sidebar, with per-project commit drafts, selections and filters retained during the current session.
- Separating typed frontend SVN command wrappers from the Rust process layer through Tauri's `invoke` API.
- Combining a file list, diff navigation and commit selection without losing the draft when returning from a diff.
- Offering five interface languages and light/dark themes.

You can inspect the [Pinia workspace store](https://github.com/firzen/StoneSVN/blob/v1.1.2/src/stores/workspace.ts), [views](https://github.com/firzen/StoneSVN/tree/v1.1.2/src/views) and [SVN bindings](https://github.com/firzen/StoneSVN/blob/v1.1.2/src/api/svn.ts).

- English website and screenshots: https://stonesvn.github.io/en/
- Repository: https://github.com/firzen/StoneSVN
- Installers: https://github.com/firzen/StoneSVN/releases/latest

Version v1.1.2 has Windows, Linux and macOS installers. The app requires a locally installed SVN CLI; macOS packages are ad-hoc signed and not notarized. General Merge, Switch and line-by-line Blame interfaces are not available.

Feedback on the file selection and multi-project UI would be useful. This is a self-submission prepared with AI assistance and checked against the project source.
