<template>
  <div class="properties-view">
    <template v-if="store.currentPath">
      <div class="property-files" :style="{ width: `${treeWidth}px` }">
        <PropertyProjectTree ref="treeView" :workspace="store.currentPath" @refresh="refreshInspector" />
        <div class="tree-resizer" role="separator" aria-orientation="vertical" :aria-label="t('properties.resizeTree')"
          :aria-valuenow="treeWidth" :aria-valuemin="220" :aria-valuemax="600" tabindex="0"
          @pointerdown="startResize" @keydown.left.prevent="resize(treeWidth - 8)" @keydown.right.prevent="resize(treeWidth + 8)"></div>
      </div>
      <SvnPropertyInspector ref="inspector" class="full-inspector"
        :workspace="store.currentPath" :file="selectedFile" :disabled="store.operationBusy"
        :status="store.statusList.find(entry => entry.path.replace(/\\/g, '/') === selectedFile)" />
    </template>
    <el-empty v-else :description="t('log.openWorkspaceFirst')">
      <el-button type="primary" @click="openWorkspace">{{ t('common.open') }}</el-button>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspace } from '@/composables/useWorkspace'
import { propertyTree } from '@/composables/usePropertyTree'
import SvnPropertyInspector from '@/components/SvnPropertyInspector.vue'
import PropertyProjectTree from '@/components/PropertyProjectTree.vue'

const { t } = useI18n()
const store = useWorkspaceStore()
const { openWorkspace } = useWorkspace()
const treeView = ref<InstanceType<typeof PropertyProjectTree> | null>(null)
const WIDTH_KEY = 'orcasvn-property-file-tree-width'
const treeWidth = ref(Math.max(220, Math.min(600, Number(localStorage.getItem(WIDTH_KEY)) || 300)))
function resize(width: number) { treeWidth.value = Math.max(220, Math.min(600, width)); localStorage.setItem(WIDTH_KEY, String(treeWidth.value)) }
function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  const element = event.currentTarget as HTMLElement
  const startX = event.clientX, width = treeWidth.value
  element.setPointerCapture(event.pointerId)
  const move = (next: PointerEvent) => resize(width + next.clientX - startX)
  const stop = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', stop); element.removeEventListener('lostpointercapture', stop) }
  element.addEventListener('pointermove', move); element.addEventListener('pointerup', stop); element.addEventListener('lostpointercapture', stop)
}
const inspector = ref<InstanceType<typeof SvnPropertyInspector> | null>(null)
const selectedFile = computed(() => store.currentPath ? propertyTree.project(store.currentPath).selected : '')
onBeforeRouteLeave(() => !store.operationBusy)
const refreshInspector = () => { void inspector.value?.reload() }
defineExpose({ refresh: () => treeView.value?.refresh() })
</script>

<style scoped>
.properties-view { display: flex; height: 100%; min-height: 0; overflow: hidden; background: var(--el-bg-color); --commit-text: var(--el-text-color-primary); --commit-muted: var(--el-text-color-secondary); --commit-border: var(--el-border-color); --commit-toolbar: var(--el-fill-color-light); }
.property-files { position: relative; display: flex; flex: 0 0 auto; min-height: 0; border-right: 1px solid var(--el-border-color); }
.tree-resizer { position: absolute; top: 0; right: -3px; bottom: 0; width: 6px; cursor: col-resize; z-index: 2; touch-action: none; }
.tree-resizer:hover, .tree-resizer:focus-visible { background: var(--el-color-primary-light-7); }
.properties-view > .el-empty { flex: 1; }
.full-inspector { min-width: 0; width: auto !important; flex: 1 1 auto !important; border-left: 0; }
.full-inspector :deep(section), .full-inspector :deep(.property-actions) { padding-left: 24px; padding-right: 24px; }
.full-inspector :deep(dl) { grid-template-columns: 90px minmax(0, 1fr); }
.full-inspector :deep(.property-field) { grid-template-columns: 100px minmax(0, 1fr); max-width: 820px; }
.full-inspector :deep(.custom-property), .full-inspector :deep(.add-property) { max-width: 820px; }
.full-inspector :deep(.property-actions) { bottom: 0; }
</style>
