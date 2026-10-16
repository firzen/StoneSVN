<template>
  <div class="property-project-tree">
    <div class="tree-toolbar"><strong>{{ t('properties.projectFiles') }}</strong>
      <el-input v-model="searchQuery" :placeholder="t('commit.searchFiles')" :aria-label="t('commit.searchFiles')"
        :disabled="store.operationBusy" clearable class="tree-search" size="small">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <button type="button" :disabled="store.operationBusy || refreshing" :title="t('menu.refresh')" @click="refresh()"><el-icon><Refresh /></el-icon></button>
    </div>
    <p v-if="searchActive && (searching || searchError || !rows.length)" class="tree-note search-note" :class="{ 'tree-error': searchError }" role="status">
      {{ searching ? t('common.loading') : searchError || t('common.noData') }}
    </p>
    <VirtualViewport ref="viewport" :item-count="rows.length" :row-height="30" role="tree" :aria-label="t('properties.projectFiles')"
      :reset-key="`${workspace}|${searchQuery}`" :content-width="220" @keydown.self="focusRow(0)">
      <template #default="{ start, end }">
        <div v-for="(row, index) in rows.slice(start, end)" :key="JSON.stringify([row.workspace, row.path, row.type])"
          class="tree-row" :class="{ active: selected(row), 'project-root': row.path === '.' }" :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
          :role="row.type === 'entry' ? 'treeitem' : 'none'" :aria-level="row.depth + 1"
          :aria-selected="row.type === 'entry' ? selected(row) : undefined"
          :aria-expanded="canToggle(row) ? tree.project(row.workspace).expanded.has(row.path) : undefined"
          :tabindex="row.type === 'entry' && (selected(row) || start + index === 0) ? 0 : -1"
          :data-tree-index="start + index" :title="row.path === '.' ? row.workspace : row.path"
          @click="choose(row)" @dblclick="canToggle(row) && toggle(row)" @keydown="rowKey($event, row, start + index)">
          <template v-if="row.type === 'entry'">
            <button v-if="canToggle(row)" type="button" class="toggle" :disabled="store.operationBusy"
              :aria-label="t(tree.project(row.workspace).expanded.has(row.path) ? 'properties.collapse' : 'properties.expand', { path: row.name })"
              tabindex="-1" @click.stop="toggle(row)" @dblclick.stop><el-icon><ArrowDown v-if="tree.project(row.workspace).expanded.has(row.path)" /><ArrowRight v-else /></el-icon></button>
            <span v-else class="toggle-spacer"></span>
            <FileTypeIcon :path="row.path" :directory="row.directory" />
            <span class="tree-name">{{ row.name }}</span>
            <span v-if="rowStatus(row)" class="status-badge" :class="getStatusClass(rowStatus(row))"
              :title="t(getStatusLabelKey(rowStatus(row)))" :aria-label="t(getStatusLabelKey(rowStatus(row)))">{{ statusSymbol(rowStatus(row)) }}</span>
            <span v-if="hasDraft(row)" class="pending-dot" :title="t('properties.unsaved')">●</span>

          </template>
          <template v-else-if="row.type === 'error'"><span class="tree-error">{{ row.name }}</span><button type="button" @click.stop="retry(row)">{{ t('properties.retry') }}</button></template>
          <span v-else class="tree-note">{{ t(row.type === 'loading' ? 'properties.loadingDirectory' : 'common.noData') }}</span>
        </div>
      </template>
    </VirtualViewport>
    <p v-if="!rows.length && !searchActive" class="tree-note empty-projects">{{ t('workspace.noWorkspace') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getStatusClass, getStatusLabelKey } from '@/composables/useSvnStatus'
import { propertyTreeStatus, statusSymbol } from '@/utils/propertyTreeStatus'
import { useWorkspaceStore } from '@/stores/workspace'
import { propertyTree as tree, canExpandPropertyEntry, type PropertyTreeRow } from '@/composables/usePropertyTree'
import { propertyDrafts, propertyDraftKey } from '@/utils/propertyDrafts'
import VirtualViewport from '@/components/VirtualViewport.vue'
import FileTypeIcon from '@/components/FileTypeIcon.vue'
import { ArrowDown, ArrowRight, Refresh, Search } from '@/components/icons/materialIcons'
import { workspaceSearch } from '@/api/svn'
import type { WorkspaceChild } from '@/types'

const props = defineProps<{ workspace: string }>()
const emit = defineEmits<{ refresh: [] }>()
const { t } = useI18n()
const store = useWorkspaceStore()
const viewport = ref<InstanceType<typeof VirtualViewport> | null>(null)
const refreshing = ref(false)
const searchQuery = ref('')
const searchActive = computed(() => Boolean(searchQuery.value.trim()))
const searchResults = ref<WorkspaceChild[]>([])
const searching = ref(false)
const searchError = ref('')
let searchGeneration = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
async function runSearch(generation = ++searchGeneration) {
  const workspace = props.workspace, query = searchQuery.value.trim()
  if (!workspace || !query) return
  searching.value = true; searchError.value = ''
  try {
    const result = await workspaceSearch(workspace, query)
    if (generation === searchGeneration) searchResults.value = result
  } catch (err) { if (generation === searchGeneration) searchError.value = String(err) }
  finally { if (generation === searchGeneration) searching.value = false }
}
watch([searchQuery, () => props.workspace], () => {
  clearTimeout(searchTimer)
  const generation = ++searchGeneration
  searchResults.value = []; searchError.value = ''
  searching.value = searchActive.value && Boolean(props.workspace)
  if (searching.value) searchTimer = setTimeout(() => { void runSearch(generation) }, 250)
})
onBeforeUnmount(() => { clearTimeout(searchTimer); searchGeneration++ })
const projects = computed(() => props.workspace ? [props.workspace] : [])
const rows = computed<PropertyTreeRow[]>(() => searchActive.value
  ? searchResults.value.map(child => ({ ...child, name: child.path, workspace: props.workspace, depth: 0, type: 'entry' }))
  : tree.rows(projects.value))
const canToggle = (row: PropertyTreeRow) => !searchActive.value && canExpandPropertyEntry(row)
const statusByPath = computed(() => new Map(store.statusList.map(entry => [entry.path.replace(/\\/g, '/'), entry])))
const rowStatus = (row: PropertyTreeRow) => row.workspace === store.currentPath ? propertyTreeStatus(row.path, statusByPath.value) : ''
const selected = (row: PropertyTreeRow) => row.type === 'entry' && store.currentPath === row.workspace && tree.project(row.workspace).selected === row.path
function hasDraft(row: PropertyTreeRow) {
  if (propertyDrafts.has(propertyDraftKey(row.workspace, row.path))) return true
  return row.directory && [...propertyDrafts.keys()].some(key => {
    const [workspace, path] = JSON.parse(key)
    return workspace === row.workspace && (row.path === '.' || path.startsWith(`${row.path}/`))
  })
}
function choose(row: PropertyTreeRow) {
  if (row.type !== 'entry' || store.operationBusy) return
  tree.select(row.workspace, row.path)
}
function toggle(row: PropertyTreeRow) {
  if (!store.operationBusy && canToggle(row)) void tree.toggle(row.workspace, row.path)
}
function retry(row: PropertyTreeRow) { if (!store.operationBusy) void tree.load(row.workspace, row.path, true) }
async function refresh(notify = true) {
  if (store.operationBusy || refreshing.value) return
  refreshing.value = true
  try {
    await Promise.all(projects.value.map(workspace => tree.refresh(workspace)))
    if (searchActive.value) { clearTimeout(searchTimer); await runSearch() }
    if (notify) emit('refresh')
  }
  finally { refreshing.value = false }
}
async function focusRow(index: number) {
  const target = Math.max(0, Math.min(rows.value.length - 1, index))
  viewport.value?.scrollToIndex(target)
  await nextTick()
  viewport.value?.element?.querySelector<HTMLElement>(`[data-tree-index="${target}"]`)?.focus()
}
function rowKey(event: KeyboardEvent, row: PropertyTreeRow, index: number) {
  if (event.target !== event.currentTarget) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    let next = index + direction
    while (next >= 0 && next < rows.value.length && rows.value[next].type !== 'entry') next += direction
    if (rows.value[next]) void focusRow(next)
  } else if (event.key === 'ArrowRight' && canToggle(row)) {
    event.preventDefault()
    if (!tree.project(row.workspace).expanded.has(row.path)) toggle(row)
    else if (rows.value[index + 1]?.type === 'entry') void focusRow(index + 1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (canToggle(row) && tree.project(row.workspace).expanded.has(row.path)) toggle(row)
    else { let parent = index - 1; while (parent >= 0 && rows.value[parent].depth >= row.depth) parent--; if (parent >= 0) void focusRow(parent) }
  } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(row) }
  else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); void focusRow(event.key === 'Home' ? 0 : rows.value.length - 1) }
}
watch(() => props.workspace, workspace => { if (workspace) void tree.open(workspace) }, { immediate: true })
defineExpose({ refresh })
</script>

<style scoped>
.property-project-tree { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
.tree-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; font-size: 12px; border-bottom: 1px solid var(--el-border-color-lighter); }
.tree-toolbar > strong, .tree-toolbar > button { flex-shrink: 0; }
.tree-search { flex: 1; min-width: 80px; }
.search-note { margin: 0; padding: 10px 14px; }
.tree-row { display: flex; align-items: center; gap: 5px; height: 30px; padding-right: 6px; box-sizing: border-box; font-size: 12px; cursor: pointer; }
.tree-row:hover { background: var(--el-fill-color-light); }
.tree-row.active { background: var(--el-color-primary-light-8); color: var(--el-color-primary); box-shadow: inset 3px 0 var(--el-color-primary); }
.tree-row:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
.project-root { font-weight: 600; }
.tree-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
button { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 3px; padding: 3px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
button:hover { background: var(--el-fill-color); } button:disabled { opacity: .5; cursor: default; }
.toggle, .toggle-spacer { width: 16px; flex: 0 0 16px; }
.status-badge { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; min-width: 20px; height: 19px; padding: 0 4px; border-radius: 3px; font-size: 11px; font-weight: 700; }
.pending-dot { color: var(--el-color-warning); font-size: 9px; }
.tree-error { color: var(--el-color-danger); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.tree-note { color: var(--el-text-color-secondary); font-size: 11px; }.empty-projects { padding: 12px; }
</style>
