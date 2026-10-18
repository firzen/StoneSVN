Sharing StoneSVN, an MIT-licensed SVN desktop client built with Vue 3, Vite, Tauri 2 and Rust. It runs on Windows, macOS and Linux and is developed from OrcaSVN.

For Vite users building desktop frontends, the concrete integration is small:

- Tauri's `beforeDevCommand` starts `vite`, and its `devUrl` points to port 1420. Vite uses `strictPort` so a busy port fails instead of silently changing the address expected by the desktop shell.
- The file watcher excludes `src-tauri`, keeping Rust changes outside the frontend watcher.
- `TAURI_DEV_HOST`, when set, controls the dev server host and the HMR WebSocket address; the HMR port is 1421 in that mode.
- Production builds run `vue-tsc --noEmit` before `vite build`. The build configuration groups Vue/Pinia/i18n, Element Plus and Tauri packages into manual chunks. These are build boundaries, not a measured startup-performance claim.

The Vue UI reviews multiple working copies, text diffs and commit selection; native SVN operations run through Tauri commands in Rust using a separately installed SVN CLI. The browser frontend does not execute SVN itself. General Merge, Switch and line-level Blame views are not currently available.

[Build configuration](https://github.com/firzen/StoneSVN/blob/main/vite.config.mts) · [Tauri integration](https://github.com/firzen/StoneSVN/blob/main/src-tauri/tauri.conf.json) · [Source and setup](https://github.com/firzen/StoneSVN) · [Overview and installers](https://stonesvn.github.io/en/)

Feedback from developers using Vite inside a desktop webview would be useful, especially on keeping the frontend/native development boundary clear. Self-submission; this introduction was prepared with AI assistance.
