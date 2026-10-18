# Project sidebar and toolbar changes

English | [简体中文](project-sidebar-2026-10-16.zh-CN.md)

The top bar retains the logo/name and consolidates the previous navigation actions, with Settings and language on the right. Buttons gain spacing; the language action keeps its globe and removes the dropdown arrow.

The left becomes a persistent project list, migrates recent workspaces, and removes the ten-project limit. Switching projects defaults to Workspace and clears the previous project's file query parameters. Drag sorting and context actions support opening directories, copying paths, moving up/down, and removing entries without touching local working copies. Sidebar width is adjustable by mouse/keyboard and persisted.

Change counts come from the latest successful scan; hover shows its time. Unscanned projects have no fabricated count. Commit drafts/selections, workspace filters/selected file, and log filters/pagination are stored per project in the current session. Project switching is disabled during commit/update, with operation status in the title.

Browser validation used simulated SVN data in light/dark themes at 1280px and 390px, checking horizontal overflow, language-button layout/arrow removal, draft isolation, and log-filter restoration. The later change to default project switches to Workspace passed the build but was not rechecked visually. Keyboard width adjustment and the English toolbar layout were checked.

`npm run build` passed; all 82 `npm run test:unit` tests passed. New tests cover record migration, more than ten projects, order persistence, removal, property-change counts, and busy state during updates.

Real Tauri SVN operations, native directory pickers, and Finder opening were not verified. Browser checks do not establish acceptance of those integrations.

Subsequent changes classify text/image/binary/directory previews, reduce repeated reads/SVN commands, merge pending rapid-switch requests, and delay loading animation. Workspace lists omit property-only changes while Commit retains them. Directory checkboxes control only the directory; Include Descendants selects its content. Temporary SVN repository tests confirmed independent commits of directory/root properties and new empty directories while child-file edits remain uncommitted.
