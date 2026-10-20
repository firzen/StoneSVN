const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

const source = ts.transpileModule(fs.readFileSync('src/composables/useSettings.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function load(storage) {
  const context = { exports: {}, localStorage: storage, require(name) {
    if (name === 'vue') return vue
    if (name === '@/i18n') return { detectSystemLocale: () => 'en-US' }
    throw new Error(name)
  } }
  vm.runInNewContext(source, context)
  return context.exports.useSettings()
}
function storage(initial = null) {
  let value = initial
  return { getItem: () => value, setItem: (key, next) => { value = next } }
}

test('diff font size persists across settings reloads and reset restores the default', async () => {
  const saved = storage()
  const first = load(saved)
  assert.equal(first.settings.diffFontSize, 13)
  first.updateSettings({ diffFontSize: 19 })
  await vue.nextTick()
  const reopened = load(saved)
  assert.equal(reopened.settings.diffFontSize, 19)
  reopened.resetSettings()
  await vue.nextTick()
  assert.equal(load(saved).settings.diffFontSize, 13)
})

test('old settings retain defaults and invalid saved diff sizes are rejected', () => {
  for (const diffFontSize of [undefined, null, '18', 9, 29, 14.5]) {
    const settings = load(storage(JSON.stringify({ diffFontSize }))).settings
    assert.equal(settings.diffFontSize, 13)
  }
  for (const diffFontSize of [10, 28]) {
    assert.equal(load(storage(JSON.stringify({ diffFontSize }))).settings.diffFontSize, diffFontSize)
  }
})
