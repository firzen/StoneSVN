// Capture the real Vue UI with fictional documentation data; no SVN operations.
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const screenshots = process.env.SCREENSHOT_DIRECTORY || path.join(__dirname, '../website/assets/screenshots')
// Documentation also needs dark Properties and English panel details.
const baseUrl = process.env.SCREENSHOT_BASE_URL || 'http://127.0.0.1:1420'
const includeDetails = process.env.SCREENSHOT_INCLUDE_DETAILS === '1'
const languages = [['en', 'en-US'], ['zh-CN', 'zh-CN'], ['zh-TW', 'zh-TW'], ['ja', 'ja-JP'], ['ko', 'ko-KR']]
async function openApp(page) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(baseUrl)
      break
    } catch (error) {
      if (attempt >= 59) throw error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__)
  await page.evaluate(async () => {
    const { runtime } = (await import('/src/composables/useSvnRuntime.ts')).useSvnRuntime()
    runtime.initialized = true
    runtime.ready = true
    runtime.error = ''
    await (await import('/node_modules/.vite/deps/vue.js')).nextTick()
  })
  await page.waitForSelector('.workspace-view')
  await page.evaluate(async () => await (await import('/docs/images/workspace-demo.js')).default)
}
async function settle(page) {
  await page.evaluate(async () => {
    await (await import('/node_modules/.vite/deps/vue.js')).nextTick()
    await document.fonts.ready
  })
  await page.mouse.move(1400, 880)
  // Allow CSS transitions to finish before deterministic capture.
  await page.waitForTimeout(350)
}
async function main() {
  fs.mkdirSync(screenshots, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  try {
    for (const [lang, locale] of languages) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale })
      try {
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await openApp(page)
        await page.evaluate(async locale => {
          (await import('/src/i18n/index.ts')).default.global.locale.value = locale
          ;(await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ language: locale, theme: 'light' })
        }, locale)
        await page.setViewportSize({ width: 800, height: 900 })
        await page.evaluate(() => document.fonts.ready)
        const compactToolbarFits = await page.locator('.fork-toolbar').evaluate(toolbar => {
          const actions = toolbar.querySelector('.toolbar-actions')
          const language = toolbar.querySelector('.toolbar-language')
          return actions.scrollWidth === actions.clientWidth
            && getComputedStyle(language).display === 'none'
            && toolbar.clientHeight < actions.clientHeight * 2
        })
        if (!compactToolbarFits) throw new Error(`Compact toolbar does not fit for ${lang}`)
        await page.setViewportSize({ width: 1440, height: 900 })
        for (const theme of ['light', 'dark']) {
          await page.evaluate(async theme => {
            (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ theme })
          }, theme)
          await settle(page)
          if (await page.locator('.conflict-badge').textContent() !== '3'
            || await page.locator('.incoming-badge:not(.conflict-badge)').textContent() !== '2') {
            throw new Error(`Missing documentation toolbar badges for ${lang}/${theme}`)
          }
          const actual = await page.evaluate(async () => (await import('/src/i18n/index.ts')).default.global.locale.value)
          if (actual !== locale) throw new Error(`Wrong screenshot locale: ${actual}`)
          const otherFile = page.locator('.workspace-files .file-item').filter({ has: page.locator('.file-path[title="docs/user-guide.md"]') })
          await otherFile.locator('.open-file-button').click()
          await page.waitForFunction(() => window.__documentationOpenedFile?.file === 'docs/user-guide.md')
          if (await page.locator('.workspace-files .file-item.selected .file-path').getAttribute('title') !== 'src/config.ts') throw new Error('Opening a file changed the workspace selection')
          await page.locator('.right-panel .open-file-button').click()
          await page.waitForFunction(() => window.__documentationOpenedFile?.file === 'src/config.ts')
          const fontControls = page.locator('.diff-font-controls').first()
          await fontControls.locator('button').last().click()
          await page.waitForFunction(() => getComputedStyle(document.querySelector('.diff-lines')).fontSize === '14px')
          const savedSize = await page.evaluate(() => JSON.parse(localStorage.getItem('orcasvn-settings')).diffFontSize)
          if (savedSize !== 14) throw new Error(`Diff font size was not saved: ${savedSize}`)
          await fontControls.locator('button').first().click()
          await page.waitForFunction(() => getComputedStyle(document.querySelector('.diff-lines')).fontSize === '13px')
          await settle(page)
          await page.screenshot({ path: path.join(screenshots, `${lang}-workspace-${theme}.png`) })
          if (includeDetails && lang === 'en' && theme === 'light') {
            await page.locator('.workspace-layout .center-panel').screenshot({ path: path.join(screenshots, 'en-file-status.png') })
            await page.locator('.workspace-layout .right-panel').screenshot({ path: path.join(screenshots, 'en-diff.png') })
          }
        }
        await page.evaluate(async () => {
          (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ theme: 'light' })
          await (await import('/docs/images/workspace-demo.js')).showPropertiesDemo()
        })
        await settle(page)
        await page.screenshot({ path: path.join(screenshots, `${lang}-properties.png`) })
        if (includeDetails) {
          await page.evaluate(async () => {
            (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ theme: 'dark' })
          })
          await settle(page)
          await page.screenshot({ path: path.join(screenshots, `${lang}-properties-dark.png`) })
          await page.evaluate(async () => {
            (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ theme: 'light' })
            await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'commit' })
          })
          await settle(page)
          await page.screenshot({ path: path.join(screenshots, `${lang}-commit.png`) })
          for (const [file, count] of [['notes/release-checklist.md', 1], ['docs/images/workspace.png', 2], ['src/config.ts', 3]]) {
            const row = page.locator('.commit-file-row').filter({ has: page.locator(`.tree-name[title="${file}"]`) })
            if (await row.locator('.diff-link').count() !== count) throw new Error(`Wrong commit actions for ${file}`)
          }
          await page.locator('.commit-file-row .tree-name[title="src/config.ts"]').dblclick()
          await page.waitForSelector('.diff-view .diff-lines')
          const openFile = page.locator('.diff-view .open-file-button')
          await openFile.click()
          await page.waitForFunction(() => window.__documentationOpenedFile?.file === 'src/config.ts')
          const selection = await page.evaluate(() => {
            const codes = [...document.querySelectorAll('.diff-view .diff-code')]
            const range = document.createRange()
            range.setStart(codes[0], 0)
            range.setEnd(codes.at(-1), codes.at(-1).childNodes.length)
            const selected = window.getSelection()
            selected.removeAllRanges()
            selected.addRange(range)
            const result = { actual: selected.toString(), expected: codes.map(code => code.textContent).join('\n') }
            selected.removeAllRanges()
            return result
          })
          const normalize = text => text.replace(/\s+/g, ' ').trim()
          if (normalize(selection.actual) !== normalize(selection.expected)) throw new Error('Diff selection includes gutter labels')
          await settle(page)
          await page.screenshot({ path: path.join(screenshots, `${lang}-comparison.png`) })
          await page.evaluate(async () => { await (await import('/docs/images/workspace-demo.js')).showUpdateDemo() })
          await page.waitForSelector('.update-view')
          await settle(page)
          if (await page.locator('.incoming-badge:not(.conflict-badge)').textContent() !== '2') throw new Error('Incoming badge does not match the demo revisions')
          await page.screenshot({ path: path.join(screenshots, `${lang}-update-incoming.png`) })
          await page.locator('.update-view .header-actions .el-button--primary').click()
          await page.waitForSelector('.result-summary')
          await page.locator('.el-message').waitFor({ state: 'hidden' })
          for (const theme of ['light', 'dark']) {
            await page.evaluate(async theme => { (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ theme }) }, theme)
            await settle(page)
            await page.screenshot({ path: path.join(screenshots, `${lang}-update-${theme}.png`) })
          }

        }
        if (process.env.SCREENSHOT_INCLUDE_CONFLICTS === '1') {
          for (const kind of ['text', 'property', 'tree']) {
            await page.evaluate(async kind => (await import('/docs/images/workspace-demo.js')).showConflictDemo(kind), kind)
            if (kind !== 'tree') await page.waitForSelector('.conflict-code-compare .monaco-diff-editor')
            else await page.waitForSelector('.tree-details')
            for (const theme of ['light', 'dark']) {
              await page.evaluate(async theme => (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ theme }), theme)
              await settle(page)
              await page.screenshot({ path: path.join(screenshots, `${lang}-conflict-${kind}-${theme}.png`) })
            }
          }
          await page.evaluate(async () => {
            await (await import('/docs/images/workspace-demo.js')).showConflictDemo('text')
            await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'workspace' })
          })
          await page.locator('.file-path[title="src/shipping-policy.ts"]').click()
          await page.waitForSelector('.right-panel .conflict-preview .monaco-diff-editor')
          for (const theme of ['light', 'dark']) {
            await page.evaluate(async theme => (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ theme }), theme)
            await settle(page)
            await page.screenshot({ path: path.join(screenshots, `${lang}-conflict-preview-${theme}.png`) })
          }
          await page.locator('.conflict-preview .el-button--primary').click()
          await page.waitForSelector('.diff-view .conflict-inspector')
        }
        await page.evaluate(async () => {
          (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ theme: 'light' })
          await (await import('/docs/images/workspace-demo.js')).showAuthenticationDemo()
        })
        const authDialog = page.locator('.el-message-box')
        await authDialog.waitFor()
        if (await authDialog.locator('input[autocomplete="username"]').inputValue() !== 'demo') throw new Error('Authentication username was not prefilled')
        await authDialog.locator('input[type="password"]').fill('documentation-password')
        await settle(page)
        if (includeDetails) await page.screenshot({ path: path.join(screenshots, `${lang}-authentication.png`) })
        await authDialog.locator('.el-button--primary').click()
        await page.waitForFunction(() => window.__documentationAuth?.complete)
        if (await page.evaluate(() => localStorage.getItem('orcasvn-settings')?.includes('documentation-password'))) throw new Error('Authentication password was persisted')
        if (errors.length) throw new Error(`Screenshot UI errors: ${errors.join('; ')}`)
        console.log(`${lang}: workspace light/dark + properties${includeDetails ? ' light/dark' : ''} captured; authentication retry verified`)
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
