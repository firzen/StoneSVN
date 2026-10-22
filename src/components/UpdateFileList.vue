<template>
  <div class="file-list">
    <div class="file-toolbar">
      <div class="status-filters" :aria-label="$t('commit.status')">
        <button type="button" :class="{ active: !status }" :aria-pressed="!status" @click="status = ''">{{ $t('update.allItems') }} {{ rows.length }}</button>
        <button v-for="entry in counts" :key="entry.status" type="button" :class="{ active: status === entry.status }"
          :aria-pressed="status === entry.status" @click="status = entry.status">{{ $t(getStatusLabelKey(entry.status)) }} {{ entry.count }}</button>
      </div>
      <el-input v-model="query" clearable :placeholder="$t('update.searchFiles')" :aria-label="$t('update.searchFiles')" class="file-search"><template #prefix><el-icon><Search /></el-icon></template></el-input>
      <el-switch v-model="grouped" :active-text="$t('update.groupDirectory')" />
    </div>
    <div class="file-scroll">
      <div class="file-head"><span>{{ $t('commit.status') }}</span><span>{{ $t('commit.file') }}</span><span>{{ $t('common.action') }}</span></div>
      <template v-for="group in groups" :key="group.path">
        <button v-if="grouped" class="directory-heading" type="button" :aria-expanded="!collapsed.has(group.path)" @click="toggleGroup(group.path)">
          <span>{{ collapsed.has(group.path) ? '▸' : '▾' }}</span><el-icon><Folder /></el-icon><span class="directory-path">{{ group.path }}</span><span>{{ group.rows.length }}</span>
        </button>
        <template v-if="!grouped || !collapsed.has(group.path)">
          <div v-for="row in group.rows" :key="row.path" class="file-row" :class="{ selected: selected === row.path }" @click="selected = row.path" @dblclick="$emit('diff', row)">
            <span><el-tag size="small" :type="tagType(row.status)" :class="getStatusClass(row.status)">{{ $t(getStatusLabelKey(row.status)) }}</el-tag></span>
            <el-dropdown trigger="contextmenu" @command="copyPath(row.path)">
              <button type="button" class="file-name" :title="row.path" @click="selected = row.path" @keydown.enter.prevent="$emit('diff', row)">
                <el-icon><Folder v-if="row.directory" /><Document v-else /></el-icon>
                <span class="file-text">{{ row.path }}</span>
              </button>
              <template #dropdown><el-dropdown-menu><el-dropdown-item command="copy">{{ $t('update.copyPath') }}</el-dropdown-item></el-dropdown-menu></template>
            </el-dropdown>
            <el-button text size="small" @click.stop="$emit('diff', row)">{{ $t('update.viewDiff') }}</el-button>
          </div>
        </template>
      </template>
      <div v-if="!filtered.length" class="file-empty">{{ rows.length ? $t('update.noMatches') : emptyText }}</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus/es/components/message/index'
import { getStatusClass, getStatusLabelKey } from '@/composables/useSvnStatus'
import { filterUpdateRows, pathParts, type UpdateListRow } from '@/utils/updateFiles'
const props = defineProps<{ rows: UpdateListRow[]; emptyText: string }>()
defineEmits<{ diff: [row: UpdateListRow] }>()
const { t } = useI18n()
const status = ref(''), query = ref(''), selected = ref('')
const grouped = ref(false)
const collapsed = ref(new Set<string>())
const counts = computed(() => {
  const map = new Map<string, number>()
  for (const row of props.rows) map.set(row.status, (map.get(row.status) || 0) + 1)
  return [...map].map(([status, count]) => ({ status, count })).sort((a, b) => Number(b.status === 'conflicted') - Number(a.status === 'conflicted') || a.status.localeCompare(b.status))
})
watch(counts, entries => { if (!entries.some(entry => entry.status === status.value)) status.value = '' })
const filtered = computed(() => filterUpdateRows(props.rows, status.value, query.value))
const groups = computed(() => {
  if (!grouped.value) return [{ path: '', rows: filtered.value }]
  const map = new Map<string, UpdateListRow[]>()
  for (const row of filtered.value) {
    const directory = pathParts(row.path).directory
    if (!map.has(directory)) map.set(directory, [])
    map.get(directory)!.push(row)
  }
  return [...map].map(([path, rows]) => ({ path, rows }))
})
const toggleGroup = (path: string) => { if (collapsed.value.has(path)) collapsed.value.delete(path); else collapsed.value.add(path) }
const tagType = (status: string) => {
  if (status === 'conflicted' || status === 'deleted') return 'danger'
  if (status === 'added') return 'success'
  if (status === 'modified' || status === 'missing' || status === 'obstructed') return 'warning'
  return 'info'
}
const copyPath = async (path: string) => {
  try { await navigator.clipboard.writeText(path); ElMessage.success(t('update.pathCopied')) }
  catch { ElMessage.error(t('update.copyFailed')) }
}
</script>
<style scoped>
.file-list { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.file-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; padding: 4px 12px; border-bottom: 1px solid var(--workbench-border); }
.status-filters { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
.status-filters button { padding: 2px 6px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--commit-muted); font: inherit; cursor: pointer; }
.status-filters button.active { color: var(--commit-accent); background: var(--workbench-selected); border-color: var(--workbench-border); }
.file-search { width: 220px; }
.file-scroll { flex: 1; min-height: 0; overflow: auto; }
.file-head, .file-row { display: grid; grid-template-columns: 110px minmax(0, 1fr) 130px; align-items: center; gap: 8px; padding: 3px 12px; }
.file-head { position: sticky; top: 0; z-index: 1; background: var(--workbench-heading); color: var(--commit-muted); }
.file-row { box-sizing: border-box; min-height: 32px; padding-top: 2px; padding-bottom: 2px; border-bottom: 1px solid var(--workbench-border); }
.file-row:hover { background: var(--workbench-hover); }
.file-row.selected { background: var(--workbench-selected); }
.file-row .status-added { background: var(--app-color-status-added-bg); color: var(--app-color-status-added-text); border-color: transparent; }
.file-row .status-modified, .file-row .status-replaced { background: var(--app-color-status-modified-bg); color: var(--app-color-status-modified-text); border-color: transparent; }
.file-row .status-deleted, .file-row .status-conflicted, .file-row .status-obstructed, .file-row .status-missing { background: var(--app-color-status-error-bg); color: var(--app-color-status-error-text); border-color: transparent; }
.file-row .status-unversioned { background: var(--app-color-status-unversioned-bg); color: var(--app-color-status-unversioned-text); border-color: transparent; }
.file-name { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 0; line-height: 20px; border: 0; background: transparent; color: var(--commit-text); font: inherit; text-align: left; cursor: pointer; }
.file-row :deep(.el-button) { min-height: 24px; height: 24px; padding: 0 6px; }
.file-name > .el-icon { flex-shrink: 0; }
.file-row :deep(.el-dropdown) { display: flex; min-width: 0; }
.file-text { min-width: 0; white-space: normal; overflow-wrap: anywhere; font-family: var(--app-font-family-mono); }
.directory-heading { display: flex; width: 100%; align-items: center; gap: 6px; padding: 5px 12px; border: 0; border-bottom: 1px solid var(--workbench-border); background: var(--workbench-toolbar); color: var(--commit-muted); font: inherit; text-align: left; cursor: pointer; }
.directory-path { overflow-wrap: anywhere; }
.file-empty { padding: 24px 12px; text-align: center; color: var(--commit-muted); }
button:focus-visible { outline: 2px solid var(--commit-accent); outline-offset: -2px; }
@media (max-width: 650px) { .file-head, .file-row { grid-template-columns: 84px minmax(0, 1fr) 96px; gap: 6px; padding-left: 8px; padding-right: 8px; } .file-search { flex: 1; min-width: 150px; } }
</style>
