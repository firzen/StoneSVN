<template>
  <el-button class="open-file-button" text size="small" :loading="opening"
    :title="label" :aria-label="label" :disabled="!workspacePath || !file"
    @click.stop="openFile" @dblclick.stop>
    <el-icon v-if="!opening"><OpenIn /></el-icon>
  </el-button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus/es/components/message/index'
import { openWorkspaceFile } from '@/api/svn'
import { OpenIn } from '@/components/icons/materialIcons'

const props = defineProps<{ workspacePath: string; file: string; directory?: boolean }>()
const { t } = useI18n()
const opening = ref(false)
const label = computed(() => t(props.directory ? 'diff.openDirectory' : 'diff.openInOtherApp'))

async function openFile() {
  if (opening.value || !props.workspacePath || !props.file) return
  opening.value = true
  try {
    await openWorkspaceFile(props.workspacePath, props.file)
  } catch (error) {
    ElMessage.error(`${t('common.error')}：${error}`)
  } finally {
    opening.value = false
  }
}
</script>

<style scoped>
.open-file-button { flex-shrink: 0; width: 24px; height: 22px; padding: 0; margin-left: 4px; color: inherit; }
</style>
