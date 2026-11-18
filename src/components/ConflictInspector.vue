<template>
  <section class="conflict-inspector" :aria-busy="loading || busy">
    <div class="conflict-file-header"><code>{{ file }}</code><el-button text size="small" :disabled="blocked" @click="load">{{ t('menu.refresh') }}</el-button></div>
    <el-skeleton v-if="loading" :rows="7" animated />
    <el-alert v-else-if="error" :title="t('conflicts.loadFailed')" :description="error" type="error" :closable="false" />
    <template v-if="details && !loading">
      <div class="conflict-toolbar">
        <div class="conflict-tabs" role="tablist" :aria-label="t('conflicts.title')">
          <button v-if="details.text" type="button" role="tab" :aria-selected="mode === 'text'" @click="mode = 'text'">{{ t('conflicts.text') }}</button>
          <button v-if="details.property" type="button" role="tab" :aria-selected="mode === 'property'" @click="mode = 'property'">{{ t('conflicts.property') }} · {{ details.properties.length || '—' }}</button>
          <button v-if="details.tree" type="button" role="tab" :aria-selected="mode === 'tree'" @click="mode = 'tree'">{{ t('conflicts.tree') }}</button>
          <button type="button" role="tab" :aria-selected="mode === 'raw'" @click="mode = 'raw'">{{ t('conflicts.rawDiff') }}</button>
        </div>
        <label v-if="mode === 'text' || mode === 'property'"><input v-model="wordWrap" type="checkbox" /> {{ t('conflicts.wrap') }}</label>
      </div>
      <el-alert v-if="details.unavailable.length && mode !== 'raw'" :title="t('conflicts.unavailable')" type="warning" :closable="false" />
      <template v-if="mode === 'text' || mode === 'property' && currentProperty">
        <div class="compare-controls">
          <select v-if="mode === 'property'" v-model="propertyIndex" :aria-label="t('conflicts.property')" :disabled="blocked">
            <option v-for="(property, i) in details.properties" :key="property.name" :value="i">{{ propertyReviewed[property.name] ? '✓ ' : '' }}{{ property.name }}</option>
          </select>
          <div v-if="mode === 'text'" class="conflict-navigation">
            <el-button size="small" @click="go('previous')" :disabled="blocks.length > 0 && index === 0">↑ {{ t('conflicts.previous') }}</el-button>
            <span>{{ blocks.length ? t('conflicts.block', { current: index + 1, total: blocks.length, line: blocks[index].line }) : t('conflicts.noMarkersShort') }}</span>
            <el-button size="small" @click="go('next')" :disabled="blocks.length > 0 && index + 1 === blocks.length">↓ {{ t('conflicts.next') }}</el-button>
          </div>
          <div class="choice-actions">
            <el-button size="small" :disabled="blocked || (mode === 'text' ? !blocks.length : !currentProperty?.incoming_known || propertyManual)" @click="mode === 'text' ? chooseTextBlock('local') : chooseCurrentProperty('local')">{{ mode === 'text' ? t('conflicts.useLocalBlock') : t('conflicts.keepLocal') }}</el-button>
            <el-button size="small" :disabled="blocked || (mode === 'text' ? !blocks.length : !currentProperty?.incoming_known || propertyManual)" @click="mode === 'text' ? chooseTextBlock('incoming') : chooseCurrentProperty('incoming')">{{ mode === 'text' ? t('conflicts.useIncomingBlock') : t('conflicts.useIncoming') }}</el-button>
          </div>
        </div>
        <div class="compare-column-headings">
          <label><select v-model="reference" :aria-label="t('conflicts.reference')">
            <option value="incoming">{{ t('conflicts.incoming') }}</option>
            <option value="local">{{ t('conflicts.local') }}</option>
            <option value="base">{{ t('conflicts.baseShort') }}</option>
          </select><span v-if="!referenceAvailable">{{ t('conflicts.unavailableShort') }}</span></label>
          <span>{{ mode === 'text' ? t('conflicts.merged') : t('conflicts.finalValue') }}<small>{{ t('conflicts.editable') }}</small></span>
        </div>
      </template>
        <KeepAlive :max="8">
        <ConflictCodeCompare v-if="mode === 'text' && details.working !== null" ref="codeEditor" :key="file + '-text'" :original="originalText" :value="textResult" :file="file" :marker-source="details.working" :word-wrap="wordWrap" :disabled="blocked" @update:value="editText" @active="index = $event" />
        <ConflictCodeCompare v-else-if="mode === 'property' && currentProperty" :key="file + '-' + currentProperty.name" :original="originalText" :value="propertyValues[currentProperty.name] ?? ''" file="property.txt" :word-wrap="wordWrap" :disabled="blocked || propertyManual || !currentProperty.incoming_known || deletedProperties[currentProperty.name]" @update:value="chooseProperty(currentProperty!.name, $event)" />
        </KeepAlive>
        <div v-if="mode === 'text' && details.working === null" class="unreadable-content">{{ t('conflicts.unavailable') }}</div>
        <div v-if="mode === 'text'" class="review-bar">
          <span>{{ textReviewed ? t('conflicts.resultReviewed') : t('conflicts.remaining', { count: remaining }) }}</span>
          <label><input v-model="textReviewed" type="checkbox" :disabled="blocked || hasConflictMarkers(textResult)" /> {{ t('conflicts.textReviewed') }}</label>
        </div>
        <div v-else-if="mode === 'property' && currentProperty" class="review-bar">
          <label><input type="checkbox" :checked="deletedProperties[currentProperty.name]" :disabled="blocked || propertyManual || !currentProperty.incoming_known" @change="chooseProperty(currentProperty!.name, ($event.target as HTMLInputElement).checked ? null : '')" /> {{ t('conflicts.removeProperty') }}</label>
          <span>{{ propertyReviewed[currentProperty.name] ? t('conflicts.resultReviewed') : t('conflicts.chooseFirst') }}</span>
        </div>
      <div v-if="mode === 'property' && !propertiesReadable" class="manual-property">
        <details v-if="details.rejection"><summary>{{ t('conflicts.rejection') }}</summary><pre>{{ details.rejection }}</pre></details>
        <label><input v-model="propertyManual" type="checkbox" :disabled="blocked" /> {{ t('conflicts.propertiesManual') }}</label>
      </div>
      <section v-if="mode === 'tree'" class="tree-details">
        <h3>{{ t('conflicts.treeReason') }}</h3>
        <dl><dt>{{ t('conflicts.local') }}</dt><dd>{{ treeLabel('reason', details.reason) }}</dd><dt>{{ t('conflicts.incoming') }}</dt><dd>{{ treeLabel('action', details.action) }}</dd></dl>
        <template v-if="simpleTree">
          <label><input v-model="treeChoice" type="radio" value="working" :disabled="blocked" /> {{ t('conflicts.keepFile') }}</label>
          <label><input v-model="treeChoice" type="radio" value="delete" :disabled="blocked" /> {{ t('conflicts.acceptDelete') }}</label>
        </template>
        <label v-else><input v-model="treeReviewed" type="checkbox" :disabled="blocked" /> {{ t('conflicts.treeManual') }}</label>
      </section>
      <div v-if="mode === 'raw'" class="raw-content">
        <details v-if="details.rejection"><summary>{{ t('conflicts.rejection') }}</summary><pre>{{ details.rejection }}</pre></details>
        <DiffViewer :text="diff" compact />
      </div>
      <footer v-if="details.text || details.property || details.tree" class="conflict-footer">
        <span>{{ t('conflicts.commitHint') }}</span>
        <el-button type="warning" :disabled="!canApply" :loading="busy" @click="apply">{{ t('conflicts.apply') }}</el-button>
      </footer>
    </template>
    <el-button v-if="error && !loading" @click="load">{{ t('properties.retry') }}</el-button>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { svnConflictDetails, svnApplyConflict } from '@/api/svn'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspace } from '@/composables/useWorkspace'
import { conflictBlocks, mergeConflictChoices, hasConflictMarkers } from '@/utils/conflictDocument'
import type { ConflictDetails } from '@/types'
import DiffViewer from './DiffViewer.vue'
const ConflictCodeCompare = defineAsyncComponent(() => import('./ConflictCodeCompare.vue'))
const props = defineProps<{ workspace: string; file: string; diff: string }>()
const emit = defineEmits<{ mutated: [] }>()
const { t } = useI18n(), store = useWorkspaceStore()
const { refreshStatusAfterMutation } = useWorkspace()
const details = ref<ConflictDetails | null>(null), loading = ref(false), busy = ref(false), error = ref('')
const textResult = ref(''), textReviewed = ref(false), propertyManual = ref(false), treeReviewed = ref(false), treeChoice = ref('')
const index = ref(0), edited = ref(false)
const mode = ref<'text' | 'property' | 'tree' | 'raw'>('text'), reference = ref<'incoming' | 'local' | 'base'>('incoming'), propertyIndex = ref(0), wordWrap = ref(false)
const codeEditor = ref<{ navigate: (direction: 'previous' | 'next') => void; choose: (index: number, side: 'local' | 'incoming') => void } | null>(null)
const choices = ref<Record<number, 'local' | 'incoming'>>({})
const propertyValues = ref<Record<string, string>>({}), deletedProperties = ref<Record<string, boolean>>({}), propertyReviewed = ref<Record<string, boolean>>({})
let generation = 0
const blocks = computed(() => conflictBlocks(details.value?.working || ''))
const blocked = computed(() => loading.value || busy.value || store.operationBusy || store.statusIsStale || store.currentPath !== props.workspace)
const propertiesReadable = computed(() => !!details.value?.properties.length && details.value.properties.every(p => p.incoming_known))
const simpleTree = computed(() => !!details.value && details.value.action === 'delete' && details.value.reason === 'edit' && !details.value.directory && !details.value.text && !details.value.property)
const canApply = computed(() => {
  const d = details.value
  return !!d && !blocked.value && (!d.text || textReviewed.value && !hasConflictMarkers(textResult.value))
    && (!d.property || (propertiesReadable.value ? d.properties.every(p => propertyReviewed.value[p.name]) : propertyManual.value))
    && (!d.tree || (simpleTree.value ? !!treeChoice.value : treeReviewed.value))
})
const currentProperty = computed(() => details.value?.properties[propertyIndex.value])
const localText = computed(() => {
  const d = details.value
  if (!d) return ''
  if (d.local !== null) return d.local
  return mergeConflictChoices(d.working || '', blocks.value, Object.fromEntries(blocks.value.map((_, i) => [i, 'local'])))
})
const originalText = computed(() => {
  if (mode.value === 'property') return currentProperty.value?.[reference.value] ?? ''
  if (reference.value === 'local') return localText.value
  return details.value?.[reference.value] ?? ''
})
const referenceAvailable = computed(() => mode.value === 'property'
  ? reference.value === 'incoming' ? !!currentProperty.value?.incoming_known : reference.value === 'base' ? currentProperty.value?.base !== null : true
  : reference.value === 'local' ? details.value?.working !== null || details.value?.local !== null : details.value?.[reference.value] !== null)
const remaining = computed(() => blocks.value.filter((_, i) => !choices.value[i]).length)
function chooseCurrentProperty(side: 'local' | 'incoming') {
  const property = currentProperty.value
  if (property) chooseProperty(property.name, property[side])
}
function chooseTextBlock(side: 'local' | 'incoming') {
  if (!codeEditor.value || !blocks.value[index.value]) return
  codeEditor.value?.choose(index.value, side)
  choices.value[index.value] = side
}
function go(direction: 'previous' | 'next') { codeEditor.value?.navigate(direction) }

function treeLabel(kind: string, value: string) {
  const key = `conflicts.${kind}.${value}`
  const translated = t(key)
  return translated === key ? t('conflicts.unknownOperation', { value }) : translated
}
async function load() {
  const request = ++generation, workspace = props.workspace, file = props.file
  loading.value = true; error.value = ''; details.value = null
  textReviewed.value = false; propertyManual.value = false; treeReviewed.value = false; treeChoice.value = ''; edited.value = false; index.value = 0
  propertyIndex.value = 0; reference.value = 'incoming'; choices.value = {}; propertyValues.value = {}; deletedProperties.value = {}; propertyReviewed.value = {}
  try {
    const d = await svnConflictDetails(workspace, file)
    if (generation !== request) return
    details.value = d; mode.value = d.text ? 'text' : d.property ? 'property' : d.tree ? 'tree' : 'raw'
    textResult.value = mergeConflictChoices(d.working || '', conflictBlocks(d.working || ''), Object.fromEntries(conflictBlocks(d.working || '').map((_, i) => [i, 'local'])))
    for (const p of d.properties) { propertyValues.value[p.name] = p.local || ''; deletedProperties.value[p.name] = p.local === null }
  } catch (e) { if (generation === request) error.value = String(e) }
  finally { if (generation === request) loading.value = false }
}
watch(() => [props.workspace, props.file], load, { immediate: true })
watch(() => store.statusIsStale, stale => { if (!stale && !busy.value) void load() })
function chooseProperty(name: string, value: string | null) {
  propertyValues.value[name] = value ?? ''; deletedProperties.value[name] = value === null; propertyReviewed.value[name] = true
}
function editText(value: string) { textResult.value = value; edited.value = true; textReviewed.value = false }
async function apply() {
  if (!canApply.value || !details.value) return
  const workspace = props.workspace, file = props.file, d = details.value, request = generation
  if (d.tree && treeChoice.value === 'delete') {
    try { await ElMessageBox.confirm(t('conflicts.deleteConfirm', { file }), t('conflicts.acceptDelete'), { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }) }
    catch { return }
  }
  if (!canApply.value || request !== generation || workspace !== props.workspace || file !== props.file) return
  busy.value = true; store.setOperationBusy(true)
  try {
    await svnApplyConflict(workspace, file, { token: d.token, text: d.text && d.working !== null ? textResult.value : null,
      properties: d.property && !propertyManual.value ? d.properties.map(p => ({ name: p.name, value: deletedProperties.value[p.name] ? null : propertyValues.value[p.name] })) : [],
      manual_text: textReviewed.value, manual_properties: propertyManual.value, tree: d.tree ? (simpleTree.value ? treeChoice.value : 'manual') : '' })
    ElMessage.success(t('svnActions.resolved'))
  } catch (e) { ElMessage.error(String(e)) }
  finally {
    if (store.currentPath === workspace) {
      try { if (!await refreshStatusAfterMutation()) ElMessage.error(t('properties.actionRefreshFailed')) } catch (e) { ElMessage.error(String(e)) }
    }
    store.setOperationBusy(false); busy.value = false
    if (workspace === props.workspace && file === props.file) { emit('mutated'); void load() }
  }
}
</script>
<style scoped>
.conflict-inspector { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; overflow: hidden; color: var(--el-text-color-primary); }
.conflict-file-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--el-border-color-light); }
.conflict-file-header code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px var(--app-font-family-mono); }
.conflict-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 12px; border-bottom: 1px solid var(--el-border-color-light); }
.conflict-toolbar > label { white-space: nowrap; font-size: 12px; }
.conflict-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.conflict-tabs button { padding: 5px 9px; border: 0; border-radius: 4px; background: transparent; color: var(--el-text-color-secondary); font: inherit; cursor: pointer; }
.conflict-tabs button[aria-selected=true] { background: var(--el-color-warning-light-9); color: var(--el-color-warning-dark-2); }
.compare-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; padding: 8px 12px; }
.conflict-navigation, .choice-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.conflict-navigation > span { font-size: 12px; color: var(--el-text-color-secondary); }
.choice-actions :deep(.el-button + .el-button) { margin-left: 0; }
select { max-width: 100%; border: 1px solid var(--el-border-color); padding: 4px 8px; border-radius: 4px; background: var(--el-bg-color); color: var(--el-text-color-primary); font: inherit; }
.compare-column-headings { display: grid; grid-template-columns: 1fr 1fr; border-block: 1px solid var(--el-border-color-light); background: var(--el-fill-color-light); }
.compare-column-headings > * { display: flex; align-items: center; gap: 8px; padding: 6px 12px; min-width: 0; }
.compare-column-headings > :last-child { border-left: 1px solid var(--el-border-color-light); }
.compare-column-headings small { color: var(--el-text-color-secondary); font-size: 11px; }
.compare-column-headings select { background: var(--el-bg-color); }
.review-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 7px 12px; border-top: 1px solid var(--el-border-color-light); font-size: 12px; color: var(--el-text-color-secondary); }
.conflict-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--el-border-color-light); }
.conflict-footer > span { font-size: 12px; color: var(--el-text-color-secondary); }
.tree-details { flex: 1; padding: 18px; overflow: auto; } h3 { margin: 0 0 18px; font-size: 15px; }
.tree-details dl { display: grid; grid-template-columns: max-content 1fr; gap: 12px 24px; } dd { margin: 0; }
.tree-details > label { display: block; margin: 16px 0; }
.raw-content { display: flex; flex-direction: column; flex: 1; overflow: auto; min-height: 0; }
.manual-property { overflow: auto; padding: 12px; } pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.7 var(--app-font-family-mono); }
summary { cursor: pointer; } .unreadable-content { flex: 1; padding: 16px; }
</style>
