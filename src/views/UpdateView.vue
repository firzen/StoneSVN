<template>
  <div class="update-view compact-workbench">
    <el-card class="update-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">
            <el-icon><RefreshRight /></el-icon>
            {{ $t('update.title') }}
          </span>
          <div class="header-actions">
            <el-button size="small" @click="loadUpdateState(true)" :loading="loading" :disabled="updating">
              <el-icon><Refresh /></el-icon>
              {{ $t('update.check') }}
            </el-button>
            <el-button type="primary" size="small" @click="doUpdate" :loading="updating" :disabled="!workspaceStore.currentPath || workspaceStore.operationBusy">
              <el-icon><RefreshRight /></el-icon>
              {{ $t('common.update') }}
            </el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="!workspaceStore.currentPath" :description="$t('log.openWorkspaceFirst')" class="empty-workspace" />

      <div v-else class="update-content">
        <div v-if="updating" class="update-progress" role="status"><el-icon class="is-loading"><Loading /></el-icon>{{ $t('update.running') }}</div>
        <div class="update-navigation">
          <div class="update-tabs" role="tablist" :aria-label="$t('common.update')">
            <button v-for="tab in visibleTabs" :id="`update-tab-${tab.key}`" :key="tab.key" type="button" role="tab"
              :aria-selected="activeTab === tab.key" aria-controls="update-panel" :tabindex="activeTab === tab.key ? 0 : -1"
              :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key" @keydown="navigateTabs($event, tab.key)">
              {{ tab.label }} <span>{{ tab.count }}</span>
            </button>
          </div>
          <div class="update-summary" aria-live="polite">
            <span>{{ $t('update.localRevision') }} <strong>r{{ localRevision || '-' }}</strong></span>
            <span aria-hidden="true">→</span>
            <span>{{ $t('update.remoteRevision') }} <strong>{{ checkState === 'ready' ? `r${remoteRevision}` : '—' }}</strong></span>
          </div>
        </div>
        <div id="update-panel" class="update-panel" role="tabpanel" :aria-labelledby="`update-tab-${activeTab}`">
          <template v-if="activeTab === 'incoming'">
            <p v-if="checkState !== 'ready' && incomingLogs.length" class="panel-hint" role="status">{{ incomingMessage }}</p>
            <template v-if="incomingLogs.length">
              <div class="incoming-versions" :style="{ height: `${Math.min(incomingLogs.length || 1, 8) * 33 + 34}px` }">
                <el-table :data="incomingLogs" :empty-text="incomingMessage" class="update-table version-table" row-key="revision"
                  stripe highlight-current-row :current-row-key="selectedIncoming?.revision" height="100%"
                  @row-click="selectIncomingRevision" :row-style="{ cursor: 'pointer' }">
                  <el-table-column :label="$t('log.revision')" width="90" align="center">
                    <template #default="{ row }"><button type="button" class="revision-link" @click.stop="selectIncomingRevision(row)"><el-tag type="primary" size="small" effect="plain">r{{ row.revision }}</el-tag></button></template>
                  </el-table-column>
                  <el-table-column prop="author" :label="$t('log.author')" width="130" show-overflow-tooltip>
                    <template #default="{ row }"><span class="version-meta"><el-icon><User /></el-icon>{{ row.author }}</span></template>
                  </el-table-column>
                  <el-table-column :label="$t('log.date')" width="190">
                    <template #default="{ row }"><span class="version-meta"><el-icon><Calendar /></el-icon>{{ formatDate(row.date) }}</span></template>
                  </el-table-column>
                  <el-table-column prop="message" :label="$t('log.commitMessage')" min-width="220" show-overflow-tooltip />
                  <el-table-column :label="$t('log.changedFiles')" width="110" align="center">
                    <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.changed_paths?.length || 0 }}</el-tag></template>
                  </el-table-column>
                </el-table>
              </div>
              <div class="incoming-files-heading">
                <strong>{{ $t('log.changedFiles') }}</strong>
                <span v-if="selectedIncoming">r{{ selectedIncoming.revision }} · {{ $t('update.changedItems', { count: incomingRows.length }) }}</span>
              </div>
              <UpdateFileList v-if="selectedIncoming" :key="selectedIncoming.revision" :rows="incomingRows" :empty-text="$t('common.noData')" @diff="viewIncomingDiff" />
            </template>
            <div v-else class="incoming-empty" role="status">
              <el-icon v-if="checkState === 'ready'"><CircleCheck /></el-icon>
              <span>{{ incomingMessage }}</span>
            </div>
          </template>
          <template v-else>
            <div class="result-summary" role="status" :class="{ 'has-conflicts': hasUpdateConflicts }">
              <strong>{{ $t(hasUpdateConflicts ? 'update.completedConflicts' : 'update.completed') }}</strong>
              <span>r{{ updateStartRevision }} → r{{ updateEndRevision || '—' }}</span>
              <time v-if="completedAt" :datetime="completedAt">{{ formatDate(completedAt) }}</time>
            </div>
            <el-alert v-if="updateWarning" class="result-warning" :title="$t('update.resultFailed')" :description="updateWarning" type="warning" :closable="false" />
            <UpdateFileList v-if="!updateWarning || updatedRows.length" key="result" :rows="updatedRows" :empty-text="updateWarning ? $t('update.resultFailed') : $t('update.noUpdatedFiles')" @diff="openUpdatedRow" />
            <div v-else class="result-unavailable"></div>
            <details v-if="updateOutput" class="execution-details"><summary>{{ $t('update.executionDetails') }}</summary><pre>{{ updateOutput }}</pre></details>
          </template>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus/es/components/message/index'
import { svnIncomingState, svnUpdate } from '@/api/svn'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspace } from '@/composables/useWorkspace'
import { useSettings } from '@/composables/useSettings'
import type { SvnLogEntry, UpdatedFile } from '@/types'
import UpdateFileList from '@/components/UpdateFileList.vue'

type UpdateStateCache = {
  remoteRevision: number
  incomingLogs: SvnLogEntry[]
}

const updateStateCache = new Map<string, UpdateStateCache>()

const router = useRouter()
const { t, locale } = useI18n()
const workspaceStore = useWorkspaceStore()
const { refreshStatusAfterMutation, refreshStatusIfStale } = useWorkspace()
const { settings } = useSettings()

const loading = ref(false)
const updating = ref(false)
const updatedFiles = ref<UpdatedFile[]>([])
const updateCompleted = ref(false)
const updateWarning = ref('')
const activeTab = ref('incoming')
const completedAt = ref('')
const updateStartRevision = ref(0)
const updateEndRevision = ref(0)
const updateOutput = ref('')
const hasUpdateConflicts = computed(() => updatedFiles.value.some(file => file.action === 'C'))
const visibleTabs = computed(() => [
  { key: 'incoming', label: t('update.incomingTitle'), count: checkState.value === 'ready' ? incomingLogs.value.length : '—' },
  ...(updateCompleted.value ? [{ key: 'result', label: t('update.updatedTitle'), count: updateWarning.value ? '—' : updatedFiles.value.length }] : []),
])
const selectedIncomingRevision = ref<number | null>(null)
const selectedIncoming = computed(() => incomingLogs.value.find(log => log.revision === selectedIncomingRevision.value) || incomingLogs.value[0] || null)
const selectIncomingRevision = (entry: SvnLogEntry) => { selectedIncomingRevision.value = entry.revision }
const actionStatus = (action: string) => ({ A: 'added', M: 'modified', D: 'deleted', R: 'replaced', C: 'conflicted' } as Record<string, string>)[action] || 'unknown'
const incomingRows = computed(() => (selectedIncoming.value?.changed_paths || []).map(file => ({ path: file.path, status: actionStatus(file.action) })))
const viewIncomingDiff = (row: { path: string }) => {
  const entry = selectedIncoming.value
  const repositoryRoot = workspaceStore.svnInfo?.repository_root?.replace(/\/$/, '')
  if (!entry || !repositoryRoot) return
  const file = entry.changed_paths.find(file => file.path === row.path)
  if (!file) return
  const pegRevision = file.action === 'D' ? Math.max(0, entry.revision - 1) : entry.revision
  const repositoryPath = row.path.startsWith('/') ? row.path : `/${row.path}`
  router.push({ name: 'diff', query: { path: `${repositoryRoot}${repositoryPath}@${pegRevision}`, revision: String(entry.revision) } })
}
const updatedRows = computed(() => updatedFiles.value.map(file => ({ path: file.path,
  status: actionStatus(file.action),
  directory: file.directory,
})))
const openUpdatedRow = (row: { path: string }) => {
  const file = updatedFiles.value.find(file => file.path === row.path)
  if (file) viewUpdatedDiff(file)
}
const navigateTabs = (event: KeyboardEvent, key: string) => {
  const tabs = visibleTabs.value
  const index = tabs.findIndex(tab => tab.key === key)
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  activeTab.value = tabs[next].key
  document.getElementById(`update-tab-${activeTab.value}`)?.focus()
}
const incomingLogs = ref<SvnLogEntry[]>([])
const remoteRevision = ref(0)
const checkState = ref<'unchecked' | 'checking' | 'ready' | 'failed'>('unchecked')
const incomingMessage = computed(() => {
  if (checkState.value === 'failed') return t('update.checkFailed')
  if (checkState.value === 'checking') return t('common.loading')
  if (checkState.value === 'unchecked') return t('update.notChecked')
  return t(incomingLogs.value.length ? 'update.incomingHint' : 'update.noIncoming')
})
let isActive = false
let updateStateTimer: number | undefined
let updateRequestGeneration = 0
const updateStateIntervalMs = 30_000

const localRevision = computed(() => workspaceStore.svnInfo?.revision || 0)

const formatDate = (date: string) => date ? new Date(date).toLocaleString(locale.value) : ''

const applyCachedState = (path: string) => {
  const cached = updateStateCache.get(path)
  if (!cached) return false

  checkState.value = 'ready'
  remoteRevision.value = cached.remoteRevision
  incomingLogs.value = cached.incomingLogs.map(entry => ({
    ...entry,
    changed_paths: [...(entry.changed_paths || [])],
  }))
  return true
}

const loadUpdateState = async (force = false, localAlreadyRefreshed = false) => {
  // A completed update must refresh shared workspace state even after navigation.
  if (!workspaceStore.currentPath || (!force && (!isActive || loading.value || updating.value))) return
  const requestedPath = workspaceStore.currentPath
  const generation = ++updateRequestGeneration
  const isCurrent = () => generation === updateRequestGeneration
    && workspaceStore.currentPath === requestedPath
    && isActive
  loading.value = true
  checkState.value = 'checking'
  try {
    const refreshed = localAlreadyRefreshed || await (force ? refreshStatusAfterMutation() : refreshStatusIfStale(updateStateIntervalMs))
    if (!isCurrent()) return
    if (!refreshed) {
      checkState.value = 'unchecked'
      return
    }
    const state = await svnIncomingState(requestedPath, settings.logLimit || 50)
    if (!isCurrent()) return
    remoteRevision.value = state.revision
    incomingLogs.value = state.logs
    checkState.value = 'ready'
    workspaceStore.setError(null)
    updateStateCache.set(requestedPath, {
      remoteRevision: remoteRevision.value,
      incomingLogs: incomingLogs.value.map(entry => ({
        ...entry,
        changed_paths: [...(entry.changed_paths || [])],
      })),
    })
  } catch (err) {
    if (!isCurrent()) return
    checkState.value = 'failed'
    incomingLogs.value = []
    updateStateCache.delete(requestedPath)
    workspaceStore.setError(String(err))
    ElMessage.error(`${t('common.error')}：${err}`)
  } finally {
    if (generation === updateRequestGeneration) loading.value = false
  }
}

const doUpdate = async () => {
  if (!workspaceStore.currentPath || workspaceStore.operationBusy) return
  const requestedPath = workspaceStore.currentPath
  updateRequestGeneration += 1
  loading.value = false
  const startRevision = localRevision.value
  updating.value = true
  workspaceStore.setOperationBusy(true)
  try {
    const result = await svnUpdate(requestedPath)
    if (workspaceStore.currentPath !== requestedPath) return
    updateStartRevision.value = startRevision
    updatedFiles.value = result.files
    updateCompleted.value = true
    activeTab.value = 'result'
    completedAt.value = new Date().toISOString()
    updateOutput.value = result.output || ''
    updateEndRevision.value = 0
    updateWarning.value = result.warning || ''
    updateStateCache.delete(requestedPath)
    incomingLogs.value = []
    checkState.value = 'unchecked'
    const refreshed = await refreshStatusAfterMutation()
    if (workspaceStore.currentPath !== requestedPath) return
    updateEndRevision.value = refreshed ? localRevision.value : 0
    // Remote history may be slow. It must not hold the completed mutation busy,
    // and the fresh local scan must not be repeated by this background request.
    if (isActive && refreshed) void loadUpdateState(true, true)
    if (hasUpdateConflicts.value || updateWarning.value) ElMessage.warning(t(hasUpdateConflicts.value ? 'update.completedConflicts' : 'update.resultFailed'))
    else ElMessage.success(t('update.completed'))
  } catch (err) {
    if (workspaceStore.currentPath !== requestedPath) return
    workspaceStore.setError(String(err))
    ElMessage.error(`${t('common.error')}：${err}`)
  } finally {
    workspaceStore.setOperationBusy(false)
    updating.value = false
  }
}

const viewUpdatedDiff = (file: UpdatedFile) => {
  router.push({ name: 'diff', query: {
    path: file.path, target: file.target,
    oldRev: String(file.old_revision), newRev: String(file.new_revision),
  } })
}

const stopUpdatePolling = () => {
  isActive = false
  if (updateStateTimer !== undefined) {
    window.clearInterval(updateStateTimer)
    updateStateTimer = undefined
  }
  updateRequestGeneration += 1
  loading.value = false
}

onActivated(() => {
  isActive = true
  if (workspaceStore.currentPath) {
    applyCachedState(workspaceStore.currentPath)
    void loadUpdateState()
  }
  updateStateTimer = window.setInterval(() => { void loadUpdateState() }, updateStateIntervalMs)
})

onDeactivated(stopUpdatePolling)
onUnmounted(stopUpdatePolling)

watch(
  () => workspaceStore.currentPath,
  (path) => {
    updateRequestGeneration += 1
    loading.value = false
    incomingLogs.value = []
    updatedFiles.value = []
    updateCompleted.value = false
    updateWarning.value = ''
    activeTab.value = 'incoming'
    completedAt.value = ''
    updateOutput.value = ''
    updateStartRevision.value = 0
    updateEndRevision.value = 0
    selectedIncomingRevision.value = null
    remoteRevision.value = 0
    checkState.value = 'unchecked'
    if (isActive && path && !applyCachedState(path)) {
      loadUpdateState()
    }
  }
)
</script>

<style scoped>
.revision-link { display: inline-flex; padding: 0; border: 0; background: transparent; cursor: pointer; }

.update-view { height: 100%; min-height: 460px !important; width: 100%; }
.update-card { min-width: 0; min-height: 460px !important; height: 100%; }
.update-card :deep(> .el-card__body) { display: flex; flex-direction: column; overflow: hidden; }
.card-header, .header-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-title { display: flex; align-items: center; gap: 6px; }
.update-content { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.update-navigation { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 0 24px; padding: 0 12px; border-bottom: 1px solid var(--workbench-border); }
.update-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin-left: auto; padding: 8px 0; color: var(--commit-muted); font-size: 11px; }
.update-summary > span { white-space: nowrap; }
.update-summary strong { margin-left: 4px; color: var(--commit-text); font-weight: 500; }
.update-tabs { display: flex; min-width: 0; max-width: 100%; overflow-x: auto; }
.update-tabs button { white-space: nowrap; background: transparent; border: 0; border-bottom: 2px solid transparent; padding: 7px 12px; color: var(--commit-muted); font: inherit; cursor: pointer; }
.update-tabs button.active { border-bottom-color: var(--commit-accent); color: var(--commit-accent); }
.update-tabs button span { margin-left: 6px; font-variant-numeric: tabular-nums; }
.update-tabs button:focus-visible { outline: 2px solid var(--commit-accent); outline-offset: -3px; }
.update-panel { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.panel-hint { margin: 0; padding: 6px 12px; color: var(--commit-muted); }
.incoming-versions { flex: 0 1 auto; min-height: 96px; max-height: 38%; overflow: hidden; }
.version-meta { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.incoming-files-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 16px; padding: 6px 12px; border-top: 1px solid var(--workbench-border); border-bottom: 1px solid var(--workbench-border); background: var(--workbench-toolbar); }
.incoming-files-heading span, .incoming-empty { color: var(--commit-muted); }
.incoming-empty { display: flex; flex: 1; align-items: center; justify-content: center; gap: 8px; padding: 32px 14px; }
.incoming-empty .el-icon { font-size: 18px; }
.revision-link:focus-visible { outline: 2px solid var(--commit-accent); outline-offset: 2px; }
.result-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 14px; padding: 7px 12px; border-bottom: 1px solid var(--workbench-border); }
.result-summary strong { color: var(--el-color-success); }
.result-summary.has-conflicts strong { color: var(--el-color-warning); }
.result-summary span { color: var(--commit-muted); }
.result-summary time { margin-left: auto; color: var(--commit-muted); font-size: 11px; }
.result-unavailable { flex: 1; }
.result-warning { flex-shrink: 0; }
.execution-details { flex-shrink: 0; border-top: 1px solid var(--workbench-border); padding: 6px 12px; }
.execution-details summary { cursor: pointer; color: var(--commit-muted); }
.execution-details pre { max-height: 140px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.update-progress { display: flex; align-items: center; gap: 8px; padding: 6px 12px; color: var(--commit-accent); }
@media (max-width: 900px) { .update-view, .update-card { min-height: 600px !important; } }
@media (max-width: 600px) { .update-navigation { gap: 0 12px; } .update-tabs button { padding: 7px 8px; } }
</style>
