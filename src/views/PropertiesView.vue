<template>
  <div class="properties-view compact-workbench" :style="{ '--property-inspector-width': `${inspectorWidth}px` }">
    <template v-if="store.currentPath">
      <div class="property-files">
        <PropertyProjectTree ref="treeView" :workspace="store.currentPath" @refresh="refreshInspector" />
        <div class="tree-resizer" role="separator" aria-orientation="vertical" :aria-label="t('properties.resizeInspector')"
          :aria-valuenow="inspectorWidth" :aria-valuemin="320" :aria-valuemax="520" tabindex="0"
          @pointerdown="startResize" @keydown.left.prevent="resize(inspectorWidth + 8)" @keydown.right.prevent="resize(inspectorWidth - 8)"></div>
      </div>
      <SvnPropertyInspector ref="inspector" class="full-inspector"
        :workspace="store.currentPath" :file="selectedFile" :disabled="store.operationBusy" show-blame
        @mutated="refreshAfterTargetAction"
        @blame="router.push({ name: 'blame', query: { path: $event } })"
        :status="store.statusList.find(entry => entry.path.replace(/\\/g, '/') === selectedFile)" />
    </template>
    <el-empty v-else :description="t('log.openWorkspaceFirst')">
      <el-button type="primary" @click="openWorkspace">{{ t('common.open') }}</el-button>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspace } from '@/composables/useWorkspace'
import { propertyTree } from '@/composables/usePropertyTree'
import SvnPropertyInspector from '@/components/SvnPropertyInspector.vue'
import PropertyProjectTree from '@/components/PropertyProjectTree.vue'

const { t } = useI18n()
const router = useRouter()
const store = useWorkspaceStore()
const { openWorkspace, refreshStatus } = useWorkspace()
const treeView = ref<InstanceType<typeof PropertyProjectTree> | null>(null)
const WIDTH_KEY = 'orcasvn-property-inspector-width'
const inspectorWidth = ref(Math.max(320, Math.min(520, Number(localStorage.getItem(WIDTH_KEY)) || 380)))
function resize(width: number) { inspectorWidth.value = Math.max(320, Math.min(520, width)); localStorage.setItem(WIDTH_KEY, String(inspectorWidth.value)) }
function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  const element = event.currentTarget as HTMLElement
  const startX = event.clientX, width = inspectorWidth.value
  element.setPointerCapture(event.pointerId)
  const move = (next: PointerEvent) => resize(width - next.clientX + startX)
  const stop = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', stop); element.removeEventListener('lostpointercapture', stop) }
  element.addEventListener('pointermove', move); element.addEventListener('pointerup', stop); element.addEventListener('lostpointercapture', stop)
}
const inspector = ref<InstanceType<typeof SvnPropertyInspector> | null>(null)
const selectedFile = computed(() => store.currentPath ? propertyTree.project(store.currentPath).selected : '')
onBeforeRouteLeave(() => !store.operationBusy)
const refreshInspector = async () => {
  const workspace = store.currentPath
  await refreshStatus()
  if (store.currentPath === workspace) await inspector.value?.reload()
}
const refreshAfterTargetAction = (action: 'delete' | 'restore' | 'refresh') => {
  const workspace = store.currentPath
  if (!workspace) return
  const file = selectedFile.value
  // Refreshing the selected parent also handles unversioned entries that disappear.
  const slash = file.lastIndexOf('/')
  if (action === 'delete' && file && file !== '.') propertyTree.select(workspace, slash < 0 ? '.' : file.slice(0, slash))
  void treeView.value?.refresh(false)
}
defineExpose({ refresh: () => treeView.value?.refresh() })
</script>

<style scoped>
.properties-view { display: flex; height: 100%; min-height: 0; overflow: hidden; background: var(--el-bg-color); }
.property-files { position: relative; display: flex; flex: 1 1 0; min-width: 220px; min-height: 0; border-right: 1px solid var(--el-border-color); }
.tree-resizer { position: absolute; top: 0; right: -3px; bottom: 0; width: 6px; cursor: col-resize; z-index: 2; touch-action: none; }
.tree-resizer:hover, .tree-resizer:focus-visible { background: var(--el-color-primary-light-7); }
.properties-view > .el-empty { flex: 1; }
.full-inspector { min-width: 0; width: var(--property-inspector-width) !important; flex: 0 0 var(--property-inspector-width) !important; border-left: 0; }
.full-inspector :deep(section), .full-inspector :deep(.property-actions) { padding-left: 14px; padding-right: 14px; }
.full-inspector :deep(dl) { grid-template-columns: 65px minmax(0, 1fr); }
.full-inspector :deep(.property-field) { grid-template-columns: 74px minmax(0, 1fr); }
.full-inspector :deep(.custom-property), .full-inspector :deep(.add-property) { max-width: 820px; }
.full-inspector :deep(.property-actions) { bottom: 0; }
</style>
