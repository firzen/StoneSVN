# Visual design re-audit 2026-10-09

English | [简体中文](visual-audit-2026-10-09.zh-CN.md)

Review of v0.6.4 source and the actual Vue browser UI against the [visual specification](visual-design-system.md), based on `d30e26d`. Results include this round's fixes without rewriting earlier audit conclusions.

## Scope and method

Reviewed tokens, global/shared/layout code, and Workspace, Checkout, Commit, Update, Log, Diff, Stash, Trace, and Settings. Browsers used local Vite and Python Playwright/Chromium without native window chrome.

An isolated session mocked Tauri commands with seven file states, logs, diffs, trace data, and unversioned previews. Long paths/authors were approximately 250–330 characters. All data was fictional: no SVN commands, remote access, or real working-copy changes.

At 1280 × 900 and 390 × 900 in both themes, nine empty-workspace pages produced 36 scenarios; eight populated pages excluding Checkout produced 32. Diff/Trace loaded manually entered long paths, Log opened details, and Stash opened Create. Boundary checks allowed local horizontal scrolling for navigation/tables/code and separately checked dialog vertical bounds and body width.

## Findings and fixes

| Finding | Fix and purpose |
| --- | --- |
| Two-column log metadata squeezed long authors; tall dialogs hid Close below the first screen | Stack metadata, wrap long text, constrain dialog height, scroll the body, and keep header/footer unshrunk. |
| Stash explanation wrapped character-by-character at 390px | Stack explanation/actions and allow actions to wrap. |
| Long stash paths competed with hunk counts; fixed-height checkboxes clipped multiline text | Allow arbitrary path wrapping and content-height checkboxes; keep counts on one line. |
| Workspace diff path displaced statistics; Trace path lacked its own ellipsis region | Truncate paths with a full `title`; retain icon/stat widths. |
| Workspace Close and Stash More lacked accessible names | Reuse localized text for `aria-label`. |
| Workspace navigation/recent actions used 3–4px radii; stash/trace inputs used 12px | Use 8px interaction tokens and 13px navigation label tokens. |
| New diff addition/deletion text lacked paired status colors | Use status text tokens while retaining line numbers and `+`/`-`. |
| Fixed blue log loading state and duplicate path/code font rules | Use primary color and shared monospace tokens. |

## Validation results

| Check | Result and limits |
| --- | --- |
| `npm run build` | Passed; Element Plus chunks still exceed 500kB. |
| `npm run test:unit` | 55 passed, zero failed. |
| Token references | Every inspected `--app-*`/`--md-*` reference is defined. |
| Contrast calculation | Sixteen variable-color pairs across both themes for primary/secondary text, primary/danger buttons, and four status classes meet 4.5:1; minimum approximately 5.79:1. Does not cover every state or translucent background. |
| 68 browser scenarios | No shell horizontal overflow or uncaught page errors; checked controls/dialogs stayed within bounds and dialog bodies did not overflow horizontally. |
| Workspace layout | Side-by-side at 1280px, vertically stacked/scrollable at 390px. |
| Mouse/keyboard | In all four combinations, file clicks had no row outline; Tab from file buttons produced actual `:focus-visible` controls with 2px outlines. |
| Revert confirmation | Full long paths remained readable; overlay clicks did not dismiss; Cancel/Close did not call mocked `svn_revert`/`delete_unversioned`. Actual execution was not confirmed. |
| Disabled/loading | Stale-cache notice and disabled danger actions visible; loading text present; overlay uses `pointer-events: none`. |
| Reduced motion | Browser simulation produced 0.01ms loading ripples with one iteration; no OS preference test. |
| Simulated recovery | At 390px in both themes, refresh failure set an error and retry cleared it; Stash More had an accessible name and opened. |

Manually reviewed both-theme screenshots for Workspace, Settings, Log details, Stash Create, and narrow Trace/Diff populated views. Screenshots establish only the shown cases; boundary checks do not replace complete visual/accessibility acceptance.

Narrow dialog screenshots (390 × 900):

| Scenario | Light | Dark |
| --- | --- | --- |
| Log details with long author/message | [Screenshot](images/visual-audit-2026-10-09/light-390-log.png) | [Screenshot](images/visual-audit-2026-10-09/dark-390-log.png) |
| Stash with long paths/hunk preview | [Screenshot](images/visual-audit-2026-10-09/light-390-stash.png) | [Screenshot](images/visual-audit-2026-10-09/dark-390-stash.png) |

## Remaining migration and acceptance

These fixes do not establish full specification compliance.

- Global/workspace styles retain duplicate declarations, specificity dependencies, and `!important`; consolidate by component.
- Some cards still use 18px radii and update summaries 6px instead of ordinary 12px. Historical fonts, spacing, and borders are not fully tokenized.
- Generic dark `.el-tag` rules neutralize some business colors. Text preserves meaning, but color semantics need per-type review.
- Not every language, overlay, error, or keyboard shortcut was covered; no screen-reader or all-page contrast scan.
- No real Tauri acceptance of checkout, commit, update, stash save/apply, revert, delete, or recovery; OS fonts/native scrolling were not checked.

Complete affected desktop workflows before further style consolidation. Retain these mock-data limitations rather than counting browser checks as desktop integration.

## Follow-up 2026-10-12

This is an appended record, not a revision of the conclusions above.

- Replaced 67 fixed font sizes (10, 11, 12, 13, 14, 18, 30px) with matching `--app-font-size-*` tokens without changing values.
- Changed update revision strips/table radii from 6px to `--app-radius-md` (12px).
- Retained 9, 15, 17, 19, 20, 24, 32, 36, 48, 64px exceptions listed in the [specification](visual-design-system.md), 4px scrollbar/11px brand/18px workspace-icon radii, and `!important` overrides.
- Build and 55 unit tests passed. Browser scenarios and real Tauri acceptance were not rerun.
