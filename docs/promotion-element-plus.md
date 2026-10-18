Sharing **StoneSVN**, an MIT-licensed desktop SVN client using Vue 3, Element Plus, Pinia and Tauri 2, with a Rust backend. The project is developed from OrcaSVN.

It is a desktop example for developers who use Vue and Element Plus outside a browser-only application. The workspace lets users switch between SVN working copies, review text diffs and choose a commit scope, with local shelves for unfinished modifications.

Some places where Element Plus is used in the UI:

- Dropdown menus for project actions and opening the current project in the file manager, editor or terminal.
- Dialogs for SVN operations and commit details.
- Icons alongside workspace actions, together with vue-i18n translations for five interface languages.

The UI sends typed command calls through Tauri to Rust, which runs a separately installed SVN CLI. Per-project drafts and selections are retained during the current session, so users can inspect a diff and return to their commit without starting over.

Source examples: [main layout and dropdowns](https://github.com/firzen/StoneSVN/blob/v1.1.2/src/layouts/MainLayout.vue), [update view](https://github.com/firzen/StoneSVN/blob/v1.1.2/src/views/UpdateView.vue), and [frontend SVN bindings](https://github.com/firzen/StoneSVN/blob/v1.1.2/src/api/svn.ts).

- English overview and screenshots: https://stonesvn.github.io/en/
- Repository: https://github.com/firzen/StoneSVN
- Installers: https://github.com/firzen/StoneSVN/releases/latest

Version v1.1.2 has Windows, Linux and macOS Apple Silicon/Intel installers. SVN CLI must be installed separately. Mac builds are ad-hoc signed and not notarized. General Merge, Switch and line-by-line Blame interfaces are not available.

Feedback on using Element Plus menus and dialogs in a desktop file workflow is welcome. This is a self-submission prepared with AI assistance and checked against the project source.
