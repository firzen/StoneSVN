# StoneSVN visual design system

English | [简体中文](visual-design-system.zh-CN.md)

Maintained: 2026-10-16. Applies to all pages, dialogs, empty states, and Settings.

## Usage and maintenance boundaries

The source as of 2026-10-16 is the maintenance baseline, including workbench styling, branding, and project entry points. The [historical audit](visual-audit-2026-10-09.md) retains earlier results. Fixed values and duplicate historical declarations remain; this specification does not prove complete implementation compliance.

| Change | Location | Constraint |
| --- | --- | --- |
| Shared colors, fonts, spacing, dimensions, motion | [Design tokens](../src/design-tokens.css) | Define semantic tokens first; provide both themes for colors. |
| Compact controls, tables, toolbars | [Workbench styles](../src/workbench.css) | Scope overrides to `.compact-workbench`; reuse theme tokens. |
| General controls and Element Plus mapping | [Global styles](../src/style.css) | Check component defaults to avoid stacked padding/duplicate overrides. |
| Page layout and local states | `src/views/`, `src/components/`, `src/layouts/` | Reuse shared tokens and constrain local overrides. |
| Theme switching | [Theme logic](../src/composables/useTheme.ts) | Switch centrally; pages must not independently query system theme. |

Change order: establish semantics/states, choose existing tokens, implement layout, check themes/focus/narrow windows, and record scope. Update this document when adding tokens. Fixed brand graphics and special business dimensions may be exceptions with documented purposes.

Index: [Colors](#colors) · [Typography and icons](#typography-and-icons) · [Spacing shapes and sizes](#spacing-shapes-and-sizes) · [Interaction states](#interaction-states) · [Responsive layout](#responsive-layout) · [Dialogs](#dialogs) · [Motion](#motion) · [Acceptance](#acceptance)

## Colors

Name colors by purpose. Both themes use the same token names; `html.theme-dark` switches values. Do not hard-code separate page colors per theme.

| Purpose | Token | Light | Dark |
| --- | --- | --- | --- |
| Primary action | `--md-sys-color-primary` | `#426b95` | `#8bc7fa` |
| On primary | `--md-sys-color-on-primary` | `#ffffff` | `#082840` |
| Selected background | `--md-sys-color-primary-container` | `#e8eef5` | `#163c61` |
| On selected background | `--md-sys-color-on-primary-container` | `#345574` | `#d9edff` |
| App canvas | `--md-sys-color-surface` | `#eceef1` | `#101820` |
| Content surface | `--md-sys-color-surface-container-lowest` | `#fcfcfd` | `#16212b` |
| Secondary surface | `--md-sys-color-surface-container-low` | `#f6f6f7` | `#131d26` |
| Primary text | `--md-sys-color-on-surface` | `#30343b` | `#e7eef6` |
| Secondary text | `--md-sys-color-on-surface-variant` | `#68717d` | `#aab9c8` |
| Divider | `--md-sys-color-outline-variant` | `#e0e2e6` | `#344454` |

Light theme uses muted blue-gray and a dark sidebar. Dark theme retains these semantics without importing the light sidebar's fixed background.

| Workbench purpose | Token | Light | Dark |
| --- | --- | --- | --- |
| Toolbar | `--app-color-toolbar` | `#f6f6f7` | `#16212b` |
| Sidebar | `--app-color-sidebar` | `#232a36` | `#16212b` |
| Sidebar text / muted | `--app-color-sidebar-text` / `--app-color-sidebar-muted` | `#d7dce4` / `#aab3c1` | Both `#aab9c8` |
| Selected project background / text | `--app-color-sidebar-selected` / `--app-color-sidebar-selected-text` | `#303947` / `#d7dce4` | `#163c61` / `#d9edff` |
| Diff surface / canvas | `--app-color-diff-surface` / `--app-color-diff-canvas` | `#f4f4f6` / `#f8f8fa` | Both `#16212b` |
| Diff metadata background / text | `--app-color-diff-meta-bg` / `--app-color-diff-meta-text` | `#eceef1` / `#586273` | `#2b2e59` / `#b7bcff` |

Light diffs have no per-line dividers; dark uses `--md-sys-color-outline-variant`. Added/deleted lines retain status colors. Use paired background/text tokens instead of opacity to distinguish file states.

| State | Prefix with `-bg` / `-text` | Light background / text | Dark background / text |
| --- | --- | --- | --- |
| Modified/replaced | `--app-color-status-modified` | `#f8efcf` / `#795b20` | `#4a330a` / `#ffd278` |
| Added | `--app-color-status-added` | `#eaf3ec` / `#28613d` | `#123d2a` / `#7fe3a2` |
| Conflict/missing/deleted | `--app-color-status-error` | `#f8ecec` / `#963e46` | `#4d2028` / `#ff9da7` |
| Unversioned | `--app-color-status-unversioned` | `#eeedf7` / `#5c5a83` | `#2b2e59` / `#b7bcff` |

Primary/secondary text, primary buttons, and status text must meet 4.5:1 against their backgrounds. Filled danger buttons use `--md-sys-color-error` / `--md-sys-color-on-error`: light `#ba1a1a` / `#ffffff`, dark `#ffb4ab` / `#690005`. Keep text badges, line numbers, and `+`/`-`; color alone is insufficient.

## Typography and icons

Body uses Inter, system UI, and system Chinese fonts; paths use `--app-font-family-mono`. Root size is 14px; compact workbenches use 12px consistently rather than shrinking text with window width.

| Level | Token | Size | Use |
| --- | --- | --- | --- |
| Micro label | `--app-font-size-2xs` | 10px | Status badges/group headings |
| Supporting metadata | `--app-font-size-xs` | 11px | Revisions/path summaries |
| Explanation | `--app-font-size-sm` | 12px | Help/filter text |
| Control label | `--app-font-size-label` | 13px | Navigation/buttons/paths |
| Body | `--app-font-size-body` | 14px | Forms/content |
| Subtitle | `--app-font-size-subtitle` | 16px | Settings sections |
| Page title | `--app-font-size-title` | 18px | Workspace/page headings |
| Welcome title | `--app-font-size-display` | 30px | Empty-state primary title only |

Try these tokens before adding a fixed size. Documented exceptions:

| Size | Use |
| --- | --- |
| 9px | Workspace status corner labels |
| 15px | Global table headers, Update/Log subtitles, sidebar brand/navigation; not yet consolidated |
| 17/19/20px | Sidebar icons and brand graphics |
| 24/32/36/48/64px | Empty-state, Settings, and Workspace icon glyphs |

Settings headings use 16px subtitle tokens. Properties, Commit, Timeline, Update, file history, and standalone Diff use `.compact-workbench` 12px body/control text, 600-weight headers, and optional 14px revision summaries.

Use weights 400/600/700 for ordinary/emphasized/headings and optionally 500 for secondary emphasis. Body line-height is 1.5, long explanations 1.6. Material Symbols use 16/20/24px, outlined normally and filled when selected. The [StoneSVN graphic](../public/stone.svg) is 36 × 36px beside the product name. Prefer system-associated file icons; fall back to FileTypeIcon SVGs on failure/browser preview. Actual metadata determines directory/symlink types. Icon buttons require accessible names.

## Spacing shapes and sizes

Use the 4px grid: `--app-spacing-xs`, `--app-spacing-sm`, `--app-spacing`, `--app-spacing-md`, `--app-spacing-lg`, `--app-spacing-xl`, `--app-spacing-2xl` are 4/8/12/16/24/32/48px. Narrow windows keep text sizes but tighten lg/xl to 16/24px. Explicitly documented compact exceptions are permitted.

| Purpose | Token | Size |
| --- | --- | --- |
| Status badge | `--app-radius-xs` | 4px |
| Button/input/navigation | `--app-radius-sm` | 8px |
| Ordinary container | `--app-radius-md` | 12px |
| Workbench | `--app-radius-sm` | 8px |
| Welcome card/dialog | `--app-radius-xl` | 24px |
| Control/input | `--app-size-control` / `--app-size-field` | 38/40px |
| Table/file row | `--app-size-table-row` / `--app-size-list-row` | 44/48px |
| Panel/page header | `--app-size-panel-header` / `--app-size-page-header` | 52/62px |
| Toolbar minimum/status bar/default sidebar | `--app-size-toolbar` / `--app-size-statusbar` / `--app-size-sidebar` | 80/28/240px |

Toolbar: brand left; Workspace, Timeline, Properties, Update, Commit, Stash, Trace, Refresh, Open With center; Settings/language right. Icons sit over text with 6px between desktop buttons, 7px internally, minimum 44 × 56px, 12px radius. Language retains the globe without an arrow.

Sidebar defaults to 240px and adjusts between 200–360px by drag or separator arrow keys. Add Local Copy and Add Remote Copy stack at the bottom with 6px gap and desktop minimum 36px height. Remote opens Checkout. Truncated paths must be available through hints/copy. Counts come only from completed scans.

General controls use 8px radii, overridden below for compact workbenches. Pills use `--app-radius-full`. Workbenches use 6px outer margins, one outer border, and thin internal dividers rather than nested cards.

### Compact workbench

[Workbench styles](../src/workbench.css) share density across Properties, Commit, Timeline, Update, file history, and standalone Diff, overriding general form dimensions. Density follows content, not window text scaling.

| Element | Rule |
| --- | --- |
| Buttons/inputs/selects | 28px high, 12px text, 4px radius, 10px horizontal button padding |
| Table cells | 32px high, 4px vertical padding, 22px line-height |
| Workbench cards | No internal shadows/extra radii; header uses `--workbench-toolbar` |
| Toolbars/filters | 14px horizontal padding, thin dividers, no stacked cards |
| Properties tree | 30px rows, 16px indentation; separate type icons/status marks |
| Inspector | Default 380px, adjustable 320–520px; independent vertical scroll and bottom Apply/Reset |
| Property text controls | Current local exception: 3px radii; native buttons 4px |
| Diff | 13px ordinary/12px compact code; 28px search/actions; retain signs/line numbers |

`--workbench-border`, `--workbench-toolbar`, `--workbench-heading`, `--workbench-hover`, and `--workbench-selected` map to semantic theme tokens. `--commit-*` is a compatibility name reused elsewhere; prefer semantic names for new styles.

## Interaction states

| State | Visual/behavior requirement |
| --- | --- |
| Default | Primary fill for primary actions; content surface/thin border for secondary. |
| Hover | Color/surface/border feedback without size or row-height changes. |
| Selected | Primary container/on-container text; workspace rows use background only, no full-row blue border. |
| Keyboard focus | `:focus-visible` 2px primary outline; inputs may use inset stroke. Focus actual row buttons. |
| Disabled | Keep readable labels and prevent activation; color alone is insufficient. |
| Loading | Show status text; business state controls repeat actions; animation is not exact progress. |
| Empty/error | Explain the situation and available entry/recovery actions; retain readable errors. |

Mouse focus must not add whole-row borders. Do not use container `:focus-within` for selection borders; it may keep row actions visible. Support Tab/Enter and list arrows/Home/End.

Authors/messages truncate to one line with full hover text, but wrap in details. Keep paths recognizable; confirmations show complete selectable paths. Tooltips must not be the sole action name.

## Responsive layout

| Width | Change |
| --- | --- |
| ≤ 1180px | Move tools below brand/settings. Keep labels/spacing and scroll inside toolbar rather than squeezing to unlabeled icons. |
| ≤ 1100px | Compact timeline filters become two columns; date range spans both. |
| ≤ 860px | Stack workspace files/diff; other multi-column pages follow their own media rules and remain reachable. |
| ≤ 650px | Project list scrolls horizontally, maximum sidebar height 170px; hide paths/resize separator, retain both Add actions at minimum 32px height. |
| ≤ 640px | Tighten large spacing and stack forms/filters according to page rules. |

Business content scrolls vertically while navigation/status remain visible. Tables/code may scroll horizontally within their area; long paths/forms must not widen the application shell. 390px is a narrow-window acceptance target, not a mobile-product commitment.

## Dialogs

Failed SVN discovery is blocking configuration: show Configure SVN Path with entry, Browse, Retry Automatic Discovery, and Validate and Continue. Disable duplicate operations during validation and retain nearby errors. Load workspaces only after validation. Overlay/Esc cannot dismiss into an unconfigured workbench. Ordinary load errors remain at the top of the workbench rather than disappearing as transient messages.

Ordinary dialogs use 24px radius without stacked Element Plus shell padding. Title/body/footer own their spacing. Reserve close-button space so long titles do not overlap it.

Nonfullscreen height is bounded by viewport minus top offset and 16px bottom gutter. Body scrolls while header/footer remain visible. Long authors/messages wrap without displacing buttons.

Confirmations share radius and `--app-spacing-lg` padding: desktop 24px/narrow 16px. Nonfullscreen width is at most viewport minus 32px. Revert/delete desktop max width is 480px; align warning icons to body top, show paths separately in monospace on a secondary surface, wrap anywhere, and scroll paths over 160px high.

Revert/delete have explicit danger and Cancel buttons. Overlay does not dismiss; Cancel/Close exits without execution. Explain consequences, including permanent irreversible unversioned deletion. Insert paths as text nodes, never HTML. Log details have desktop max width 960px and narrow gutters.

## Motion

| Purpose | Duration | Rule |
| --- | --- | --- |
| Hover/color/border/focus | 150ms | `--app-transition-fast` already includes easing; do not append `ease-out`. |
| Content entry/loading exit | 250ms | `--app-transition-normal` or duration-only `--app-duration-normal`. |
| Slower local transition | 350ms | Only when needed. |
| Loading loop | Independent cycle | Only while pending; never exact progress. |

Loading overlays fade in over 150ms and out over 250ms. Indicator scale is at most 1.05; do not animate blur filters per frame. Overlay does not intercept pointers; controls manage business disabling.

Avoid `transition: all`; name changing properties. Press scale may be 0.98. Under `prefers-reduced-motion: reduce`, global animations run once for 0.01ms, delays become zero, and smooth scrolling/press scaling are removed. Loading text remains.

## Acceptance

Validate affected scope. Documentation changes check links, tokens, and implementation descriptions. Style/component changes run `npm run build`, `npm run test:unit`, and relevant visual checks.

| Dimension | Minimum coverage | Pass criterion |
| --- | --- | --- |
| Theme/window | Light/dark × 1280px/390px | Readable, reachable, no shell overflow |
| Interaction | Mouse selection/hover/keyboard focus/disabled | Independent selection/focus; no full-row blue click border |
| Content boundaries | Long paths/authors/messages, empty/error | Stable layout with full content accessible |
| Dialogs | Long title/path, cancel/close/overlay | No title/close overlap; cancel performs no action |
| Motion | Normal/reduced | No layout jumps; retained status feedback |
| Desktop integration | Affected real-working-copy flows | UI matches SVN; browser preview does not substitute |

Audit records state date, changes, method, coverage, and unverified items. Preserve earlier results instead of retroactively claiming later fixes had passed. See [2026-10-01 audit](visual-audit-2026-10-01.md). The later removal of whole-row `:focus-within` borders established the distinction between selection and keyboard focus.

See [2026-10-02 implementation](visual-implementation-2026-10-02.md) and [2026-10-09 re-audit](visual-audit-2026-10-09.md) for later fixes and remaining gaps.

## Current screenshots and validation scope

Workspace/Properties screenshots were recaptured on 2026-10-16 in light/dark at 1440 × 900 with fictional projects, paths, URLs, code, and properties. See [screenshot instructions](images/README.md). Light screenshots show blue-gray colors, dark sidebar, and StoneSVN graphic; Properties shows tree, statuses, search, and actions.

This round changed documentation/screenshot scripts only, inspected four images for text/icons/panels/sensitive content, and compared documented colors/sizes with source. No export/delete/restore/property writes were executed. It does not establish complete visual compliance or native icons/SVN/dialog integration. Properties remains side-by-side; its narrow reachability requires separate testing rather than inheriting Workspace's stacked-layout result.
