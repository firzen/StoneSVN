<template>
  <section class="conflict-preview" :aria-busy="loading">
    <header class="preview-header">
      <code>{{ file }}</code>
      <el-button type="primary" size="small" :disabled="disabled" @click="$emit('compare')">{{ t('conflicts.openComparison') }}<el-icon><ArrowRight /></el-icon></el-button>
    </header>
    <el-skeleton v-if="loading" class="preview-message" :rows="5" animated />
    <div v-else-if="error" class="preview-message"><p>{{ t('conflicts.loadFailed') }}</p><el-button size="small" @click="load">{{ t('properties.retry') }}</el-button></div>
    <p v-else-if="details && !types.length" class="preview-message">{{ t('conflicts.noConflict') }}</p>
    <template v-else-if="details">
      <div class="preview-types">
        <button v-for="type in types" :key="type" type="button" :aria-pressed="mode === type" @click="mode = type">{{ t(`conflicts.${type}`) }}</button>
        <select v-if="mode === 'property' && details.properties.length > 1" v-model="propertyIndex" :aria-label="t('conflicts.property')">
          <option v-for="(property, index) in details.properties" :key="property.name" :value="index">{{ property.name }}</option>
        </select>
        <code v-else-if="mode === 'property' && property">{{ property.name }}</code>
      </div>
      <template v-if="mode !== 'tree' && readable">
        <div class="preview-columns"><span>{{ t('conflicts.incoming') }}<small v-if="mode === 'property' && property?.incoming === null">{{ t('conflicts.notSet') }}</small></span><span>{{ t('conflicts.local') }}<small v-if="mode === 'property' && property?.local === null">{{ t('conflicts.notSet') }}</small></span></div>
        <ConflictCodeCompare :key="file + '-' + mode + '-' + propertyIndex" :original="incoming" :value="local" :file="mode === 'property' ? 'property.txt' : file" :marker-source="mode === 'text' ? details.working || '' : ''" :modified-label="t('conflicts.local')" disabled compact />
      </template>
      <div v-else-if="mode === 'tree'" class="preview-message tree-preview">
        <dl><dt>{{ t('conflicts.local') }}</dt><dd>{{ operationLabel('reason', details.reason) }}</dd><dt>{{ t('conflicts.incoming') }}</dt><dd>{{ operationLabel('action', details.action) }}</dd></dl>
      </div>
      <p v-else class="preview-message">{{ t('conflicts.unavailable') }}</p>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { svnConflictDetails } from '@/api/svn'
import { conflictBlocks, mergeConflictChoices } from '@/utils/conflictDocument'
import { useWorkspaceStore } from '@/stores/workspace'
import type { ConflictDetails } from '@/types'
const ConflictCodeCompare = defineAsyncComponent(() => import('./ConflictCodeCompare.vue'))
const props = defineProps<{ workspace: string; file: string; disabled?: boolean }>()
defineEmits<{ compare: [] }>()
const { t } = useI18n(), store = useWorkspaceStore()
const details = ref<ConflictDetails | null>(null), loading = ref(false), error = ref('')
const mode = ref<'text' | 'property' | 'tree'>('text'), propertyIndex = ref(0)
let generation = 0
const types = computed(() => (['text', 'property', 'tree'] as const).filter(type => details.value?.[type]))
const property = computed(() => details.value?.properties[propertyIndex.value])
const readable = computed(() => mode.value === 'property' ? !!property.value?.incoming_known : details.value?.incoming != null && (details.value?.working != null || details.value?.local != null))
const incoming = computed(() => mode.value === 'property' ? property.value?.incoming ?? '' : details.value?.incoming ?? '')
const local = computed(() => {
  if (mode.value === 'property') return property.value?.local ?? ''
  const working = details.value?.working
  if (working == null) return details.value?.local ?? ''
  const blocks = conflictBlocks(working)
  return mergeConflictChoices(working, blocks, Object.fromEntries(blocks.map((_, index) => [index, 'local'])))
})
function operationLabel(kind: string, value: string) {
  const key = `conflicts.${kind}.${value}`, label = t(key)
  return label === key ? t('conflicts.unknownOperation', { value }) : label
}
async function load() {
  const request = ++generation
  loading.value = true; details.value = null; error.value = ''; propertyIndex.value = 0
  try {
    const result = await svnConflictDetails(props.workspace, props.file)
    if (request !== generation) return
    details.value = result
    mode.value = result.text ? 'text' : result.property ? 'property' : 'tree'
  } catch (e) { if (request === generation) error.value = String(e) }
  finally { if (request === generation) loading.value = false }
}
watch(() => [props.workspace, props.file], load, { immediate: true })
watch(() => store.statusIsStale, stale => { if (!stale) void load() })
onBeforeUnmount(() => { generation++ })
</script>
<style scoped>
.conflict-preview { display: flex; flex-direction: column; flex: 1; height: 100%; min-height: 0; min-width: 0; overflow: hidden; }
.preview-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--el-border-color-light); }
.preview-header code { min-width: 0; overflow-wrap: anywhere; font: 12px/1.6 var(--app-font-family-mono); }
.preview-header .el-button { flex-shrink: 0; }
.preview-header .el-icon { margin-left: 4px; }
.preview-types { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 7px 12px; font-size: 12px; }
.preview-types button { padding: 3px 6px; background: transparent; color: var(--el-text-color-secondary); border: 0; border-radius: 4px; cursor: pointer; font: inherit; }
.preview-types button[aria-pressed=true] { color: var(--el-color-warning-dark-2); background: var(--el-color-warning-light-9); }
.preview-types code { overflow-wrap: anywhere; }
.preview-types select { max-width: 100%; padding: 3px 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); border: 1px solid var(--el-border-color); border-radius: 4px; font: inherit; }
.preview-columns { display: grid; grid-template-columns: 1fr 1fr; border-block: 1px solid var(--el-border-color-light); background: var(--el-fill-color-light); font-size: 12px; }
.preview-columns > span { padding: 7px 12px; }
.preview-columns > span + span { border-left: 1px solid var(--el-border-color-light); }
.preview-columns small { margin-left: 6px; color: var(--el-text-color-secondary); }
.preview-message { padding: 16px; color: var(--el-text-color-secondary); line-height: 1.7; }
.tree-preview dl { display: grid; grid-template-columns: max-content 1fr; gap: 10px 16px; margin: 0; }
.tree-preview dd { margin: 0; }
</style>
