<template>
  <el-dialog :model-value="!runtime.ready" :title="$t('svnSetup.title')" width="560px"
    :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false" append-to-body>
    <p>{{ $t('svnSetup.description') }}</p>
    <el-alert v-if="runtime.error" :title="$t('svnSetup.failed')" :description="runtime.error"
      type="error" show-icon :closable="false" class="setup-error" />
    <el-form label-position="top" @submit.prevent="applyPath">
      <el-form-item :label="$t('settings.svnPath')">
        <el-input v-model="path" :disabled="runtime.checking" :placeholder="$t('settings.svnPathPlaceholder')"
          :aria-label="$t('settings.svnPath')" @keyup.enter="applyPath">
          <template #append>
            <el-button :disabled="runtime.checking" @click="browse">{{ $t('common.browse') }}</el-button>
          </template>
        </el-input>
      </el-form-item>
    </el-form>
    <p class="setup-hint">{{ $t('svnSetup.hint') }}</p>
    <template #footer>
      <el-button :disabled="runtime.checking" @click="configure('')">{{ $t('svnSetup.detect') }}</el-button>
      <el-button type="primary" :disabled="!path.trim() || runtime.checking" :loading="runtime.checking" @click="applyPath">
        {{ $t('svnSetup.apply') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { useSvnRuntime } from '@/composables/useSvnRuntime'

const { runtime, configure } = useSvnRuntime()
const path = ref(runtime.path)
watch(() => runtime.ready, ready => { if (!ready) path.value = runtime.path })
async function applyPath() {
  if (path.value.trim() && !runtime.checking) await configure(path.value)
}
async function browse() {
  try {
    const selected = await open({ directory: false, multiple: false })
    if (typeof selected === 'string') path.value = selected
  } catch (error) {
    runtime.error = String(error)
  }
}
</script>

<style scoped>
.setup-error { margin-bottom: 16px; overflow-wrap: anywhere; }
.setup-hint { color: var(--el-text-color-secondary); font-size: var(--app-font-size-sm); }
</style>
