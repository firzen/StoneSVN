<template>
  <el-config-provider :locale="elementLocale">
    <router-view v-if="runtime.initialized" />
    <SvnSetupDialog />
  </el-config-provider>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useLocale } from './composables/useLocale'
import { useSvnRuntime } from './composables/useSvnRuntime'
import SvnSetupDialog from './components/SvnSetupDialog.vue'

const { elementLocale } = useLocale()
const { runtime } = useSvnRuntime()

const restrictContextMenu = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    event.preventDefault()
    return
  }

  // Preserve native editing actions; file rows provide their own menu.
  const input = target.closest('input, textarea')
  if ((input && !input.matches(':disabled')) || target.isContentEditable) return
  event.preventDefault()
}

onMounted(() => document.addEventListener('contextmenu', restrictContextMenu, true))
onBeforeUnmount(() => document.removeEventListener('contextmenu', restrictContextMenu, true))
</script>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
}
</style>
