# Documentation screenshots

English | [简体中文](README.zh-CN.md)

Updated: 2026-10-18. Images come from the actual v1.1.2 Vue development interface through local Vite, showing the Properties action toolbar and descendant status. Browser screenshots omit native window chrome and do not establish native integration acceptance.

SVN status, diff, tree, and property data are fictional fixtures from `workspace-demo.js`. No remote repository or SVN write is involved; project names, paths, URLs, and code are examples. No real working copy, personal directory, account, or credential is read. Unscanned fixture projects do not show invented counts.

| File | Scenario |
| --- | --- |
| `orcasvn-workspace.png` | Simplified Chinese, light, 1440 × 900; projects, toolbar, files, selected diff. |
| `orcasvn-workspace-dark.png` | Same scene in dark theme. |
| `stonesvn-properties.png` | Simplified Chinese, light, 1440 × 900; tree, status marks, properties, actions. |
| `stonesvn-properties-dark.png` | Properties in dark theme. |

## Recapture

Requires Node.js, npm, and Chromium available to Playwright CLI. Use an isolated browser session to avoid real saved project lists. Start Vite from the repository root:

```bash
npm run dev -- --host 127.0.0.1
```

In a second terminal, use the Playwright CLI commands below from the root:

```bash
mkdir -p output/playwright
npx --package @playwright/cli playwright-cli -s=docs-refresh open http://127.0.0.1:1420
npx --package @playwright/cli playwright-cli -s=docs-refresh resize 1440 900
npx --package @playwright/cli playwright-cli -s=docs-refresh eval "async () => await (await import('/docs/images/workspace-demo.js')).default"
npx --package @playwright/cli playwright-cli -s=docs-refresh snapshot
npx --package @playwright/cli playwright-cli -s=docs-refresh run-code "async (page) => { await page.mouse.move(1400, 880); await page.screenshot({path: 'output/playwright/workspace-light.png'}); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh eval "async () => { (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({theme:'dark'}); await (await import('/node_modules/.vite/deps/vue.js')).nextTick(); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh run-code "async (page) => { await page.screenshot({path: 'output/playwright/workspace-dark.png'}); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh eval "async () => await (await import('/docs/images/workspace-demo.js')).showPropertiesDemo()"
npx --package @playwright/cli playwright-cli -s=docs-refresh snapshot
npx --package @playwright/cli playwright-cli -s=docs-refresh run-code "async (page) => { await page.screenshot({path: 'output/playwright/properties-dark.png'}); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh eval "async () => { (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({theme:'light'}); await (await import('/node_modules/.vite/deps/vue.js')).nextTick(); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh run-code "async (page) => { await page.screenshot({path: 'output/playwright/properties-light.png'}); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh close
```

Before capture, confirm only `stone-demo`, `docs-site`, and `ui-components` appear, all under `/workspaces/`. Six fixture files should appear with `src/config.ts` selected and Diff showing three additions/two deletions. Wait for icons/fonts. Properties expands `src` and selects `config.ts`, uses only `svn.example.com`, and prefixes local sample properties with `demo:`. Confirm the new StoneSVN graphic and Add Local Copy/Add Remote Copy actions.

Inspect every image for text, panels, errors, and sensitive information, then replace:

```bash
cp output/playwright/workspace-light.png docs/images/orcasvn-workspace.png
cp output/playwright/workspace-dark.png docs/images/orcasvn-workspace-dark.png
cp output/playwright/properties-light.png docs/images/stonesvn-properties.png
cp output/playwright/properties-dark.png docs/images/stonesvn-properties-dark.png
```

The script injects data only when manually imported in the development session; it is not an application import. Refresh removes the mocked command bridge, but fixture projects/theme remain in that browser storage. After closing, use Playwright CLI `-s=docs-refresh delete-data` to remove the dedicated session.

The checks cover four screenshots and fixture data. Missing native Tauri bridge console messages and release-check network results are not desktop integration acceptance.

## Quick-start illustrations

`quickstart/` holds two flow diagrams plus cropped status/diff details used by [Quick start](../../QUICKSTART.md). `workflow-en.png` and `conflict-resolution-en.png` have English labels; their unsuffixed counterparts are retained for the [Chinese guide](../../QUICKSTART.zh-CN.md). Chinese panel details retain the Simplified Chinese locale; English guides use separately captured `screenshots/en-file-status.png` and `screenshots/en-diff.png`.

## Capture matching document languages

Current READMEs, quick starts, and user guides use `screenshots/` assets matching their language: `en`, `zh-CN`, `zh-TW`, `ja`, or `ko`. Each has `workspace-light`, `workspace-dark`, `properties`, and `properties-dark` images. English file-status and diff panel captures bring the total to 22. Flow diagrams remain in `quickstart/` with language-specific labels. Legacy Chinese captures above remain available for historical documentation.

Start Vite, then run from the repository root:

```bash
SCREENSHOT_DIRECTORY=docs/images/screenshots SCREENSHOT_INCLUDE_DETAILS=1 node scripts/capture-website.cjs
```

Install Playwright Chromium first, or prefix the command with `PLAYWRIGHT_CHANNEL=chrome` to use an isolated temporary Chrome session. The script changes the actual interface language/theme in isolated browser contexts and verifies the locale before capture. Detail images are screenshots of real panels, with no text replacement. Without these options, website capture still produces its original 15 images. All data remains fictional and no SVN writes are performed.
