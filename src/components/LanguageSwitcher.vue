<template>
  <el-dropdown popper-class="language-dropdown" @command="handleLanguageChange">
    <el-button text class="language-switcher-button" :aria-label="`${$t('language.label')}: ${currentLanguageLabel}`">
      <svg class="language-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9" />
        <path d="M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9" />
      </svg>
      <span>{{ currentLanguageLabel }}</span>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="lang in languages"
          :key="lang.value"
          :command="lang.value"
        >
          {{ lang.label }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from '@/composables/useLocale'

const { locale, t } = useI18n()
const { setLocale } = useLocale()

const languages = computed(() => [
  { label: t('language.zhCN'), value: 'zh-CN' },
  { label: t('language.zhTW'), value: 'zh-TW' },
  { label: t('language.jaJP'), value: 'ja-JP' },
  { label: t('language.koKR'), value: 'ko-KR' },
  { label: t('language.enUS'), value: 'en-US' },
])

const currentLanguageLabel = computed(() => {
  const lang = languages.value.find((l) => l.value === locale.value)
  return lang?.label || t('language.zhCN')
})

const handleLanguageChange = (command: string) => {
  setLocale(command)
}
</script>

<style scoped>
.language-switcher-button {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 56px;
  gap: 7px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--app-radius-md);
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  font-size: var(--app-font-size-sm);
  transition:
    color var(--app-transition-fast),
    background-color var(--app-transition-fast);
}

.language-switcher-button:hover,
.language-switcher-button:focus {
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-state-hover);
}

.language-switcher-button :deep(> span) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}

.language-icon {
  width: 20px;
  height: 20px;
  color: currentColor;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

:global(.theme-dark) .language-switcher-button,
:global(.dark) .language-switcher-button {
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
}

:global(.theme-dark) .language-switcher-button:hover,
:global(.theme-dark) .language-switcher-button:focus,
:global(.dark) .language-switcher-button:hover,
:global(.dark) .language-switcher-button:focus {
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-state-hover);
}
</style>
