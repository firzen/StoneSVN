# TODO

English | [简体中文](todo.zh-CN.md)

## P1 Log date-range display and filter stability

Status: migrated to a stable component implementation; visual acceptance remains pending.

### Symptoms

- Start/end date labels became incorrect after optimization.
- First fix replaced labels with placeholders, which disappeared after selection.
- Second fix wrapped fixed labels outside `el-date-picker`, but screenshots showed a blank right input and an unclear empty state.
- Third fix used native `input[type="date"]`; the browser showed a mixed localized placeholder (`yyyy/mm/日`) and a white system calendar inconsistent with the dark theme.
- Fourth fix attempted a custom calendar, but its content was squeezed into the filter bar, exposing mounting/clipping risks.

### Root causes

- Essential labels cannot depend on placeholders, which disappear once populated.
- A custom `.date-filter` wrapper coupled Element Plus internals, global theme styles, and scoped deep selectors too tightly.
- Leftover `log-date-picker-dropdown` and `.date-filter input` rules indicated dead code and unclear ownership after repeated replacements.
- Input structure/style ownership was unclear across wrapper, component internals, and theme overrides, rather than merely a missing color.
- Native date placeholders/formats/popups are controlled by the browser/OS and cannot reliably match `YYYY/MM/DD` and the application's dark popup.
- A calendar embedded with `el-popover` can leak or clip due to parent sizing, overflow, and mount strategy.

### Current fix

- Use Element Plus standard `daterange`, avoiding custom popups/native-date limitations.
- Empty inputs show Start Date/End Date placeholders; selected values use `YYYY/MM/DD`.
- Preserve ordering constraints: the range prevents start after end, and clearing clears both.
- Default dates remain empty so opening Log does not restrict history to today.
- Reset through `getDefaultFilters()` to prevent duplicated reset logic drifting.
- Remove obsolete `log-date-picker-dropdown`, `.date-filter`, and custom `calendar-*` styles.

### Acceptance criteria

- No filter overflow, overlap, or leaked popup content in dark theme.
- Empty dates are identifiable and not blank blocks.
- Empty state uses the application date hint, never browser-localized `yyyy/mm/日`.
- Calendar matches the dark theme and is neither a white system picker nor squeezed into the filter bar.
- Selected values consistently use `YYYY/MM/DD`.
- End cannot precede start, and start cannot follow end.
- Reset clears author, keyword, and both dates.
- Initial Log entry applies no date restriction and displays loaded history.
- Narrow filters do not overlap, clip, or squeeze Reset.

### Regression requirements

- Do not turn essential fixed date labels back into placeholders.
- If `el-date-picker` is reintroduced, define fixed-label ownership in the outer component and input width/color/empty state in one style layer; verify actual dark screenshots.
- Do not use native `input[type="date"]` for Log filtering.
- Do not draw a calendar inside the filter bar; prefer standard `daterange` or an independently reusable component and verify popup placement.
- Search/remove remaining `date-filter`, `date-picker`, and `log-date-picker` rules when changing controls.

Related: `src/views/LogView.vue`, `src/style.css`.

## Pending clarification Issue 6 long paths in Diff

Status: Issue 6 is closed and v0.6.1 added layout constraints; original triggers/overflowing elements still need confirmation.

### Known evidence

- Some filenames in the report already had ellipses. The user's v0.6 environment also did; the reported failure was not reproduced.
- v0.6.0 already used `text-overflow: ellipsis` in the file list. Simplified measurements showed list truncation worked while the diff-header path could exceed its label.
- Log-to-Diff navigation passes a full repository URL and may lengthen the header. Evidence does not establish that this caused the original screenshot.

### Follow-up

- Obtain version, OS, scaling, window size, navigation path, and sanitized URL/file-path lengths.
- Compare v0.6.0/v0.6.1 under identical data/window conditions to locate the actual overflow.
- Confirm filenames stay inside the sidebar with ellipses, header paths do not obscure revision/statistics, and full paths remain available on hover.
- If reproduced in v0.6.1, capture actual widths/computed styles before determining a fix.

Related: `src/views/DiffView.vue`, `src/views/LogView.vue`; [Issue 6](https://github.com/wustites/OrcaSVN/issues/6).

## P2 Commit-tree virtualization and lazy expansion

Status: deferred at user request; this round covered Workspace/Diff virtual scrolling only.

- Migrate CommitView from el-tree to ElTreeV2, remove default-expand-all, and initially expand only the root.
- Store expansion/selection in the data layer so collapsed/unrendered descendants still count.
- Expand matching ancestors during search and restore earlier expansion afterward.
- Optimize selection/partial-selection counts to avoid repeated full-descendant traversal during rendering.
- Check large-directory selection, hidden-match totals, state after refresh, and full-scope deletion/replacement constraints.

Related: `src/views/CommitView.vue`, `src/utils/changeTree.ts`.

## P2 CLI entry point and update checks

Status: implemented; real installer acceptance remains pending on every platform.

### Implemented

- Support `stonesvn` and `stonesvn <path>`. The first existing directory argument not starting with `-` opens as the workspace; otherwise use the last workspace (`launch_workspace_path`).
- Windows NSIS `installerHooks` (`src-tauri/installer/hooks.nsh`) adds/removes the installation directory in user PATH. Case-insensitivity lets `stonesvn` invoke `StoneSVN.exe`.
- Linux deb/rpm create `/usr/bin/stonesvn -> /usr/bin/StoneSVN`; remove it on uninstall, not upgrade.
- Startup asynchronously checks GitHub `releases/latest` with a ten-second timeout and stable `x.y.z` comparison. A newer version adds status-bar/Settings notices linking to Releases. Failures are silent; Settings provides Check for Updates. Version still comes from `package.json`.
- Downloads open the release page; Tauri updater integration would require signing keys/artifact changes.

### Pending acceptance and limitations

- Verify `stonesvn` from a new Windows terminal after installation and no stale PATH after uninstall; similarly check Linux deb/rpm.
- macOS `.app`/DMG has no installer script. Users can run `ln -s /Applications/StoneSVN.app/Contents/MacOS/StoneSVN /usr/local/bin/stonesvn`; consider an Install CLI action in Settings.
- Running `stonesvn <path>` while the app is open starts a second instance. Reusing a window would require a single-instance plugin.
