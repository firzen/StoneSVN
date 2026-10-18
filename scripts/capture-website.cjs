// Capture the real Vue UI with fictional documentation data; no SVN operations.
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const screenshots = process.env.SCREENSHOT_DIRECTORY || path.join(__dirname, '../website/assets/screenshots')
// Documentation also needs dark Properties and English panel details.
const includeDetails = process.env.SCREENSHOT_INCLUDE_DETAILS === '1'
const languages = [['en', 'en-US'], ['zh-CN', 'zh-CN'], ['zh-TW', 'zh-TW'], ['ja', 'ja-JP'], ['ko', 'ko-KR']]
async function openApp(page) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto('http://127.0.0.1:1420')
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
        for (const theme of ['light', 'dark']) {
          await page.evaluate(async theme => {
            (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({ theme })
          }, theme)
          await settle(page)
          const actual = await page.evaluate(async () => (await import('/src/i18n/index.ts')).default.global.locale.value)
          if (actual !== locale) throw new Error(`Wrong screenshot locale: ${actual}`)
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
        }
        if (errors.length) throw new Error(`Screenshot UI errors: ${errors.join('; ')}`)
        console.log(`${lang}: workspace light/dark + properties${includeDetails ? ' light/dark' : ''} captured`)
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
