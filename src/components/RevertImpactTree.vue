<template>
  <section class="revert-impact">
    <strong>{{ t('svnActions.affectedItems', { count: entries.length }) }}</strong>
    <p class="impact-hint">{{ t('svnActions.affectedItemsHint') }}</p>
    <div class="impact-tree" :style="{ height: `${Math.min(rows.length * 28, 280)}px` }">
      <VirtualViewport :item-count="rows.length" :row-height="28" :reset-key="root" role="tree" :aria-label="t('svnActions.affectedTree')">
        <template #default="{ start, end }">
          <div v-for="row in rows.slice(start, end)" :key="row.node.path" class="impact-row" role="treeitem"
            :aria-level="row.depth + 1" :aria-expanded="row.node.children.length ? !collapsed.has(row.node.path) : undefined"
            :style="{ paddingLeft: `${row.depth * 14 + 6}px` }">
            <button v-if="row.node.children.length" type="button" class="impact-toggle" :aria-label="t(collapsed.has(row.node.path) ? 'properties.expand' : 'properties.collapse', { path: row.node.path })"
              @click="toggle(row.node.path)"><el-icon><ArrowRight v-if="collapsed.has(row.node.path)" /><ArrowDown v-else /></el-icon></button>
            <span v-else class="impact-spacer"></span>
            <FileTypeIcon :path="row.node.path" :directory="isDirectoryChange(row.node)" />
            <span class="impact-name" :title="row.node.path">{{ row.node.label }}</span>
            <span v-if="row.node.entry" class="impact-status">{{ t(['unversioned', 'ignored', 'external'].includes(row.node.entry.status_code) ? 'svnActions.removedUnversioned' : getStatusLabelKey(displayStatus(row.node.entry))) }}</span>
          </div>
        </template>
      </VirtualViewport>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildChangeTree, flattenChangeTree, isDirectoryChange } from '@/utils/changeTree'
import { getStatusLabelKey } from '@/composables/useSvnStatus'
import VirtualViewport from './VirtualViewport.vue'
import FileTypeIcon from './FileTypeIcon.vue'
import type { SvnStatus } from '@/types'
const props = defineProps<{ entries: SvnStatus[]; root: string }>()
const { t } = useI18n()
const collapsed = ref(new Set<string>())
const rows = computed(() => flattenChangeTree(buildChangeTree(props.entries, props.root), collapsed.value))
function toggle(path: string) {
  const next = new Set(collapsed.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsed.value = next
}
const displayStatus = (entry: SvnStatus) => ['normal', 'none', ''].includes(entry.status_code)
  ? entry.history ? 'added' : entry.prop_status === 'conflicted' ? 'conflicted' : 'modified' : entry.status_code
</script>

<style scoped>
.revert-impact { margin-top: 14px; font-size: 12px; }
.impact-hint { margin: 5px 0 8px; color: var(--el-text-color-secondary); line-height: 1.5; }
.impact-tree { max-height: 280px; border: 1px solid var(--el-border-color); border-radius: 4px; overflow: hidden; }
.impact-tree :deep(.virtual-viewport) { height: 100%; }
.impact-row { display: flex; align-items: center; gap: 6px; height: 28px; padding-right: 8px; }
.impact-row:hover { background: var(--el-fill-color-light); }
.impact-toggle, .impact-spacer { flex: 0 0 16px; width: 16px; }
.impact-toggle { padding: 0; border: 0; background: transparent; color: var(--el-text-color-secondary); cursor: pointer; }
.impact-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.impact-status { flex-shrink: 0; margin-left: auto; padding-left: 6px; color: var(--el-text-color-secondary); white-space: nowrap; }
:global(.svn-revert-confirm) { width: min(600px, calc(100vw - 32px)) !important; max-width: calc(100vw - 32px) !important; }
:global(.svn-revert-confirm .el-message-box__container) { align-items: flex-start; }
:global(.svn-revert-confirm .el-message-box__message) { min-width: 0; width: 100%; }
</style>
