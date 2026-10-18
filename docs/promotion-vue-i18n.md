Sharing StoneSVN, an MIT-licensed SVN desktop client developed from OrcaSVN. It uses Vue 3, Vue I18n, Pinia and Element Plus in a Tauri application, with locale files for English, Simplified Chinese, Traditional Chinese, Japanese and Korean.

For Vue I18n users, the implementation is a small desktop example:

- `createI18n` uses `legacy: false` and `fallbackLocale: 'en-US'`, with the five message objects imported explicitly.
- Startup checks a persisted user language against the supported-locale list. If it is missing or invalid, the app checks `navigator.languages` in preference order and falls back to English.
- The detector maps the explicitly supported Chinese tags, including `zh-CN`, `zh-TW`, `zh-Hans`, `zh-Hant`, `zh-HK` and `zh-MO`, to the two shipped Chinese message sets. It is a small explicit mapping, not a claim to implement every BCP 47 matching rule.
- The Settings language control goes through the locale composable. Element Plus locale data is mapped separately, so the component library and application messages can follow the selected language together.

[Vue I18n setup and detection](https://github.com/firzen/StoneSVN/blob/main/src/i18n/index.ts) · [Locale composable](https://github.com/firzen/StoneSVN/blob/main/src/composables/useLocale.ts) · [Message files](https://github.com/firzen/StoneSVN/tree/main/src/i18n/locales) · [Screenshots and installers](https://stonesvn.github.io/en/)

The application reviews SVN working copies, diffs, selected commits and local stashes. It requires a separately installed SVN CLI; General Merge, Switch and line-level Blame views are not available. Source and installers are public for Windows, macOS and Linux.

Feedback on locale selection in desktop webviews or keeping component-library translations aligned would be useful. Self-submission; this introduction was prepared with AI assistance.
