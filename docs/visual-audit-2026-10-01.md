# Style and motion audit 2026-10-01

English | [简体中文](visual-audit-2026-10-01.zh-CN.md)

## Scope

Source review covered the specification, tokens, global styles, layout, Workspace, Log, Commit, Update, Diff, Stash, Trace, Checkout, Settings, and shared components. Browser review used local Vite. Confirmation previews used the same Element Plus components/classes/text nodes without connecting to SVN or reverting/deleting anything.

## Fixes

| Issue | Change |
| --- | --- |
| Confirmation padding removed; title/buttons touched edges | Restore responsive padding, 24px radii, and viewport width constraints. |
| Default dialog and section padding stacked | Clear shell padding and reserve title/close-button space. |
| Percentage-width log details too narrow | Use a 960px maximum and viewport gutters. |
| A second easing invalidated animation utilities | Remove duplicate easing. |
| Missing global reduced motion | Cover component/library animation, transitions, delays, smooth scrolling, and press scale. |
| Loading exit scaled to 1.3 with animated blur over 520ms | Fade over 250ms with at most 1.05 scale. |
| Dark overrides erased status semantics; badges/diffs fixed to light colors | Use paired status tokens and remove redundant overrides. |
| Danger buttons used light red with white text | Use theme-specific error/on-error pairs. |
| Inputs/cards/dark navigation had inconsistent radii | Use 8px inputs/navigation and 12px ordinary cards. |
| Later rules overrode primary hover | Restore theme-primary hover values. |
| Fixed author-filter focus color and transition-all | Use a primary 2px focus and explicit transition properties. |

## Validation

- `npm run build` passed; all 48 unit tests passed, including revert/delete confirmations and path escaping.
- All referenced `--app-*` and `--md-*` tokens are defined.
- Settings screenshots passed in both themes at 390px and light theme at 1280px.
- Confirmations passed in both themes at 390px/1280px: long paths wrapped and buttons remained inside. Measured desktop padding was 24px with no page overflow.
- No real Tauri SVN actions were executed. Populated log/stash details and other pages still need desktop acceptance. Reduced-motion rules were source-reviewed; OS-preference switching was not tested.

## Follow-up

Historical styles still include duplicates, fixed colors, and special dimensions, especially Welcome. Preserve layout while migrating by component; this change does not claim complete tokenization. Integration acceptance should include long authors/messages, empty/error states, keyboard focus, cancellation/closing, and loading feedback under reduced motion.
