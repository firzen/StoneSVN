<template>
  <div class="blame-view compact-workbench">
    <el-card class="blame-card">
      <template #header>
        <div class="card-header">
          <span class="view-title"><el-icon><Edit /></el-icon>{{ $t('menu.blame') }}</span>
          <div class="header-actions">
            <el-input size="small" v-model="currentPath" :placeholder="$t('diff.filePath')" clearable class="path-input" @keyup.enter="loadHistory">
              <template #prefix><el-icon><Document /></el-icon></template>
            </el-input>
            <el-button size="small" @click="browseFile">{{ $t('common.browse') }}</el-button>
            <el-button size="small" @click="loadHistory" :loading="loading" type="primary">{{ $t('blame.load') }}</el-button>
          </div>
        </div>
      </template>
      <div class="blame-content">
        <div v-if="loadedFile" class="blame-header"><span :title="loadedFile" class="path-label">{{ loadedFile }}</span></div>
        <el-table :data="logs" v-loading="loading" height="100%" row-key="revision" stripe class="blame-table" @row-dblclick="openRevision">
          <el-table-column prop="revision" :label="$t('log.revision')" width="100" align="center">
            <template #default="{ row }"><el-tag size="small" effect="plain">r{{ row.revision }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="author" :label="$t('log.author')" width="150" show-overflow-tooltip />
          <el-table-column prop="date" :label="$t('log.date')" width="190">
            <template #default="{ row }">{{ new Date(row.date).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="message" :label="$t('log.commitMessage')" min-width="240">
            <template #default="{ row }"><span class="revision-message">{{ row.message }}</span></template>
          </el-table-column>
          <el-table-column width="100" align="center">
            <template #default="{ row }"><el-button size="small" text @click="openRevision(row)">{{ $t('common.diff') }}</el-button></template>
          </el-table-column>
        </el-table>
        <div class="history-pagination">
          <el-button size="small" :disabled="loading || pageIndex === 0" @click="changePage(pageIndex - 1)">{{ $t('log.previousPage') }}</el-button>
          <span>{{ $t('log.pageNumber', { page: pageIndex + 1 }) }}</span>
          <el-button size="small" :disabled="loading || !hasMore" @click="changePage(pageIndex + 1)">{{ $t('log.nextPage') }}</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { open } from '@tauri-apps/plugin-dialog'
import { ElMessage } from 'element-plus/es/components/message/index'
import { svnFileLog } from '@/api/svn'
import { useWorkspaceStore } from '@/stores/workspace'
import { useI18n } from 'vue-i18n'
import { toWorkspaceRelativePath } from '@/utils/workspacePath'
import type { SvnLogEntry } from '@/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
const currentPath = ref('')
const loadedFile = ref('')
const loading = ref(false)
const logs = ref<SvnLogEntry[]>([])
const pageIndex = ref(0)
const hasMore = ref(false)
const cursors = ref<(number | undefined)[]>([undefined])
const PAGE_SIZE = 20
let generation = 0

const changePage = async (page: number) => {
  const workspace = workspaceStore.currentPath
  const file = loadedFile.value
  if (!workspace || !file || page < 0 || page >= cursors.value.length) return
  const request = ++generation
  loading.value = true
  try {
    const entries = await svnFileLog(workspace, file, PAGE_SIZE + 1, cursors.value[page])
    if (request !== generation || workspace !== workspaceStore.currentPath) return
    logs.value = entries.slice(0, PAGE_SIZE)
    pageIndex.value = page
    hasMore.value = entries.length > PAGE_SIZE
    cursors.value = cursors.value.slice(0, page + 1)
    if (hasMore.value) cursors.value.push(logs.value[PAGE_SIZE - 1].revision - 1)
  } catch (err) {
    if (request === generation) ElMessage.error(`${t('common.error')}：${err}`)
  } finally {
    if (request === generation) loading.value = false
  }
}

const loadHistory = async () => {
  const workspace = workspaceStore.currentPath
  if (!workspace) return
  const file = toWorkspaceRelativePath(currentPath.value, workspace)
  if (file === null || file.split('/').includes('..')) {
    ElMessage.warning(t('diff.fileOutsideWorkspace'))
    return
  }
  ++generation
  logs.value = []; loadedFile.value = file; pageIndex.value = 0; hasMore.value = false
  cursors.value = [undefined]; loading.value = false
  if (file) { currentPath.value = file; await changePage(0) }
}

const browseFile = async () => {
  const workspace = workspaceStore.currentPath
  if (!workspace) return
  const selected = await open({ directory: false, multiple: false, defaultPath: workspace, title: t('dialog.selectFile') })
  if (!selected || workspace !== workspaceStore.currentPath) return
  currentPath.value = Array.isArray(selected) ? selected[0] : selected
  await loadHistory()
}

const openRevision = (entry: SvnLogEntry) => {
  if (!loadedFile.value || loading.value) return
  sessionStorage.removeItem('orca_diff_files')
  router.push({ name: 'diff', query: { path: loadedFile.value, revision: String(entry.revision) } })
}

watch(() => [workspaceStore.currentPath, route.query.path] as const, ([workspace, path], previous) => {
  ++generation
  logs.value = []; loadedFile.value = ''; loading.value = false; hasMore.value = false; pageIndex.value = 0
  currentPath.value = typeof path === 'string' && (!previous || workspace === previous[0]) ? path : ''
  if (currentPath.value) void loadHistory()
}, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<style scoped>
.blame-view { height: 100%; min-height: 0; }
.blame-card { height: 100%; }
.blame-card :deep(.el-card__body) { display: flex; flex-direction: column; flex: 1; min-height: 0; height: auto; overflow: hidden; }
.card-header { display: flex; align-items: center; gap: 16px; min-width: 0; }
.view-title { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 12px; font-weight: 600; }
.header-actions { display: flex; align-items: center; justify-content: flex-end; flex: 1; min-width: 0; gap: 8px; }
.header-actions > .el-button { flex-shrink: 0; margin-left: 0; }
.path-input { width: min(420px, 100%); min-width: 0; }
.blame-content { display: flex; flex: 1; min-height: 0; flex-direction: column; padding: 10px 14px 0; gap: 8px; }
.blame-header { display: flex; min-width: 0; color: var(--commit-muted); }
.path-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.blame-table { min-height: 0; flex: 1; }
.history-pagination { display: flex; justify-content: center; align-items: center; flex-shrink: 0; gap: 12px; padding: 8px 0; border-top: 1px solid var(--commit-border); }
.revision-message { white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 860px) {
  .card-header { flex-wrap: wrap; gap: 8px; }
  .header-actions { flex-basis: 100%; }
  .path-input { flex: 1; }
}
@media (max-width: 420px) {
  .history-pagination { gap: 6px; }
}
</style>
