<template>
  <div class="property-project-tree">
    <div class="tree-toolbar"><strong>{{ t('properties.projectFiles') }}</strong>
      <button type="button" :disabled="store.operationBusy || refreshing" :title="t('menu.refresh')" @click="refresh"><el-icon><Refresh /></el-icon></button>
    </div>
    <VirtualViewport ref="viewport" :item-count="rows.length" :row-height="30" role="tree" :aria-label="t('properties.projectFiles')"
      :content-width="220" @keydown.self="focusRow(0)">
      <template #default="{ start, end }">
        <div v-for="(row, index) in rows.slice(start, end)" :key="JSON.stringify([row.workspace, row.path, row.type])"
          class="tree-row" :class="{ active: selected(row), 'project-root': row.depth === 0 }" :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
          :role="row.type === 'entry' ? 'treeitem' : 'none'" :aria-level="row.depth + 1"
          :aria-selected="row.type === 'entry' ? selected(row) : undefined"
          :aria-expanded="row.directory ? tree.project(row.workspace).expanded.has(row.path) : undefined"
          :tabindex="row.type === 'entry' && (selected(row) || start + index === 0) ? 0 : -1"
          :data-tree-index="start + index" :title="row.path === '.' ? row.workspace : row.path"
          @click="choose(row)" @dblclick="row.directory && toggle(row)" @keydown="rowKey($event, row, start + index)">
          <template v-if="row.type === 'entry'">
            <button v-if="row.directory" type="button" class="toggle" :disabled="store.operationBusy"
              :aria-label="t(tree.project(row.workspace).expanded.has(row.path) ? 'properties.collapse' : 'properties.expand', { path: row.name })"
              tabindex="-1" @click.stop="toggle(row)" @dblclick.stop><el-icon><ArrowDown v-if="tree.project(row.workspace).expanded.has(row.path)" /><ArrowRight v-else /></el-icon></button>
            <span v-else class="toggle-spacer"></span>
            <FileTypeIcon :path="row.path" :directory="row.directory" />
            <span class="tree-name">{{ row.name }}</span>
            <span v-if="hasDraft(row)" class="pending-dot" :title="t('properties.unsaved')">●</span>

          </template>
          <template v-else-if="row.type === 'error'"><span class="tree-error">{{ row.name }}</span><button type="button" @click.stop="retry(row)">{{ t('properties.retry') }}</button></template>
          <span v-else class="tree-note">{{ t(row.type === 'loading' ? 'properties.loadingDirectory' : 'common.noData') }}</span>
        </div>
      </template>
    </VirtualViewport>
    <p v-if="!rows.length" class="tree-note empty-projects">{{ t('workspace.noWorkspace') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { propertyTree as tree, type PropertyTreeRow } from '@/composables/usePropertyTree'
import { propertyDrafts, propertyDraftKey } from '@/utils/propertyDrafts'
import VirtualViewport from '@/components/VirtualViewport.vue'
import FileTypeIcon from '@/components/FileTypeIcon.vue'
import { ArrowDown, ArrowRight, Refresh } from '@/components/icons/materialIcons'

const props = defineProps<{ workspace: string }>()
const emit = defineEmits<{ refresh: [] }>()
const { t } = useI18n()
const store = useWorkspaceStore()
const viewport = ref<InstanceType<typeof VirtualViewport> | null>(null)
const refreshing = ref(false)
const projects = computed(() => props.workspace ? [props.workspace] : [])
const rows = computed(() => tree.rows(projects.value))
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
  if (!store.operationBusy && row.directory) void tree.toggle(row.workspace, row.path)
}
function retry(row: PropertyTreeRow) { if (!store.operationBusy) void tree.load(row.workspace, row.path, true) }
async function refresh() {
  if (store.operationBusy || refreshing.value) return
  refreshing.value = true
  try { await Promise.all(projects.value.map(workspace => tree.refresh(workspace))); emit('refresh') }
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
  } else if (event.key === 'ArrowRight' && row.directory) {
    event.preventDefault()
    if (!tree.project(row.workspace).expanded.has(row.path)) toggle(row)
    else if (rows.value[index + 1]?.type === 'entry') void focusRow(index + 1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (row.directory && tree.project(row.workspace).expanded.has(row.path)) toggle(row)
    else { let parent = index - 1; while (parent >= 0 && rows.value[parent].depth >= row.depth) parent--; if (parent >= 0) void focusRow(parent) }
  } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(row) }
  else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); void focusRow(event.key === 'Home' ? 0 : rows.value.length - 1) }
}
watch(() => props.workspace, workspace => { if (workspace) void tree.open(workspace) }, { immediate: true })
defineExpose({ refresh })
</script>

<style scoped>
.property-project-tree { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden; }
.tree-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; font-size: 12px; border-bottom: 1px solid var(--el-border-color-lighter); }
.tree-row { display: flex; align-items: center; gap: 5px; height: 30px; padding-right: 6px; box-sizing: border-box; font-size: 12px; cursor: pointer; }
.tree-row:hover { background: var(--el-fill-color-light); }
.tree-row.active { background: var(--el-color-primary-light-8); color: var(--el-color-primary); box-shadow: inset 3px 0 var(--el-color-primary); }
.tree-row:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
.project-root { font-weight: 600; }
.tree-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
button { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 3px; padding: 3px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
button:hover { background: var(--el-fill-color); } button:disabled { opacity: .5; cursor: default; }
.toggle, .toggle-spacer { width: 16px; flex: 0 0 16px; }
.pending-dot { color: var(--el-color-warning); font-size: 9px; }
.tree-error { color: var(--el-color-danger); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.tree-note { color: var(--el-text-color-secondary); font-size: 11px; }.empty-projects { padding: 12px; }
</style>
