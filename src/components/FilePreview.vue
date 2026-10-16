<template>
  <DiffViewer v-if="result.preview_kind === 'text'" :text="result.diff" :compact="compact" @stats="$emit('stats', $event)" />
  <div v-else-if="result.preview_kind === 'image' && !imageFailed" class="image-preview">
    <img :src="result.image_data || ''" :alt="result.path" @error="imageFailed = true" />
  </div>
  <div v-else class="file-preview-message">
    <p>{{ $t(result.preview_kind === 'directory' ? 'diff.directoryHint' : 'diff.binaryHint') }}</p>
    <el-button v-if="result.can_open" :loading="opening" @click="openFile">
      {{ $t(result.preview_kind === 'directory' ? 'diff.openDirectory' : 'diff.openInOtherApp') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus/es/components/message/index'
import DiffViewer from './DiffViewer.vue'
import { openWorkspaceFile } from '@/api/svn'
import type { FilePreviewResult } from '@/types'

const props = defineProps<{ result: FilePreviewResult; workspacePath: string; compact?: boolean }>()
const emit = defineEmits<{ stats: [stats: { added: number; removed: number }] }>()
const { t } = useI18n()
const imageFailed = ref(false)
const opening = ref(false)
watch(() => props.result, () => {
  imageFailed.value = false
  emit('stats', { added: 0, removed: 0 })
}, { immediate: true })
async function openFile() {
  opening.value = true
  try {
    await openWorkspaceFile(props.workspacePath, props.result.path)
  } catch (error) {
    ElMessage.error(`${t('common.error')}：${error}`)
  } finally {
    opening.value = false
  }
}
</script>

<style scoped>
.image-preview { display: flex; flex: 1; min-height: 0; overflow: auto; align-items: flex-start; justify-content: center; padding: 16px; }
.image-preview img { display: block; max-width: 100%; height: auto; object-fit: contain; }
.file-preview-message { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; color: var(--md-sys-color-on-surface-variant); }
.file-preview-message p { margin: 0; }
</style>
