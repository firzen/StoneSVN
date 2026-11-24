// Run against `npm run preview -- --host 127.0.0.1 --port 1424` after `npm run build`.
// Uses the production bundle and fictional IPC responses, never a real repository.
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const baseUrl = process.env.AUTH_UI_BASE_URL || 'http://127.0.0.1:1424'
const languages = ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR']

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  try {
    for (const language of languages) {
      for (const outcome of ['success', 'cancel', 'rejected']) {
        const context = await browser.newContext()
        try {
          const page = await context.newPage()
          const errors = []
          page.on('pageerror', error => errors.push(error.message))
          page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
          await page.addInitScript(({ language, outcome }) => {
            localStorage.setItem('orcasvn-last-workspace', '/workspaces/auth-demo')
            localStorage.setItem('orcasvn-recent-workspaces', '["/workspaces/auth-demo"]')
            localStorage.setItem('orcasvn-settings', JSON.stringify({ language }))
            window.__authenticationTest = { logCalls: 0, configurations: 0 }
            let authenticated = false
            window.__TAURI_INTERNALS__ = {
              invoke: async (command, args) => {
                const state = window.__authenticationTest
                if (command === 'configure_svn_executable') return { version: '1.15.0', path: '/demo/svn', source: 'bundled' }
                if (command === 'svn_info') return { path: '/workspaces/auth-demo', url: 'https://demo@svn.example.com/repo', repository_root: 'https://svn.example.com/repo', revision: 1, node_kind: 'dir', schedule: 'normal' }
                if (command === 'svn_local_revision') return 1
                if (command === 'svn_status') return []
                if (command === 'configure_svn_credentials') {
                  if (args.server !== 'https://svn.example.com' || args.username !== 'demo' || args.password !== 'fictional-password') throw new Error('Unexpected test credentials')
                  state.configurations++
                  authenticated = outcome === 'success'
                  return
                }
                if (command === 'svn_log') {
                  state.logCalls++
                  if (authenticated) return []
                  throw "svn: E170013: Unable to connect to a repository at URL 'https://demo@svn.example.com/repo'\nsvn: E215004: Authentication failed"
                }
                if (command === 'svn_incoming_state') return { revision: 1, total: 0, logs: [] }
                return null
              },
            }
          }, { language, outcome })
          await page.goto(`${baseUrl}/#/log`)
          const dialog = page.locator('.el-message-box')
          await dialog.waitFor()
          const username = dialog.locator('input[autocomplete="username"]')
          assert.equal(await username.inputValue(), 'demo')
          assert.equal(await username.getAttribute('readonly'), '')
          if (outcome === 'cancel') {
            await dialog.locator('.el-button').first().click()
          } else {
            // Empty required fields must not close the dialog or configure credentials.
            await dialog.locator('.el-button--primary').click()
            assert.equal(await dialog.isVisible(), true)
            assert.equal(await page.evaluate(() => window.__authenticationTest.configurations), 0)
            await dialog.locator('input[type="password"]').fill('fictional-password')
            await dialog.locator('.el-button--primary').click()
          }
          await dialog.waitFor({ state: 'hidden' })
          await page.waitForFunction(expected => window.__authenticationTest.logCalls === expected, outcome === 'cancel' ? 1 : 2)
          await page.waitForTimeout(200)
          assert.equal(await page.locator('.el-message-box').count(), 0)
          const state = await page.evaluate(() => window.__authenticationTest)
          assert.equal(state.configurations, outcome === 'cancel' ? 0 : 1)
          assert.equal(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('fictional-password'))), false)
          assert.deepEqual(errors, [])
          console.log(`${language}: production authentication ${outcome} passed`)
        } finally { await context.close() }
      }
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
