<template>
  <aside class="property-inspector" :aria-label="t('properties.title')" :aria-busy="fetching || saving || exporting">
    <header>
      <strong>{{ t('properties.title') }}</strong><span v-if="dirty" class="dirty-dot" :title="t('properties.unsaved')">●</span>
      <Teleport :to="actionsTarget || 'body'" :disabled="!actionsTarget">
        <div v-if="showBlame && file" v-show="actionsActive !== false" class="target-actions">
          <SvnTargetOperations :workspace="workspace" :file="file" :details="details" :status="status" :disabled="disabled || dirty || fetching || saving || exporting"
            v-slot="{ canMove, canRevert, hasDraft, moveTarget, revertTarget }" @mutated="targetOperationsMutated">
            <div v-show="canRevert || canExport || exporting || canBlame" class="action-group">
              <el-button v-if="canRevert" text size="small" type="danger" :title="t('svnActions.revertLocal')" @click="revertTarget"><el-icon><Back /></el-icon>{{ t('common.revert') }}</el-button>
              <el-button v-if="canExport || exporting" text size="small" :disabled="exporting" @click="exportTarget">
                <el-icon :class="{ 'is-loading': exporting }"><Loading v-if="exporting" /><Download v-else /></el-icon>{{ t('properties.export') }}
              </el-button>
              <el-button v-if="canBlame" text size="small" @click="openBlame"><el-icon><Edit /></el-icon>{{ t('menu.blame') }}</el-button>
            </div>
            <div v-show="canMove || canAdd || canCancelAdd" class="action-group">
              <el-button v-if="canMove" text size="small" @click="moveTarget(true)"><el-icon><Edit /></el-icon>{{ t('svnActions.rename') }}</el-button>
              <el-button v-if="canMove" text size="small" @click="moveTarget(false)"><el-icon><FolderOpened /></el-icon>{{ t('svnActions.move') }}</el-button>
              <el-button v-if="canAdd" text size="small" type="primary" @click="addTarget"><el-icon><Plus /></el-icon>{{ t('properties.addToVersionControl') }}</el-button>
              <el-button v-if="canCancelAdd" text size="small" :title="t('properties.cancelAddHint')" @click="cancelAddTarget"><el-icon><Minus /></el-icon>{{ t('properties.cancelAdd') }}</el-button>
            </div>
            <div v-show="canRestore || (canResolveConflict && !hasDraft)" class="action-group">
              <SvnConflictActions :workspace="workspace" :file="file" :status="status" :disabled="disabled || dirty || fetching || saving || exporting || hasDraft"
                @mutated="targetOperationsMutated" />
              <el-button v-if="canRestore" text size="small" @click="restoreTarget"><el-icon><RefreshLeft /></el-icon>{{ t('properties.restoreTo') }}</el-button>
            </div>
            <div v-show="canDelete" class="action-group">
              <el-button v-if="canDelete" text size="small" type="danger" @click="deleteTarget"><el-icon><Delete /></el-icon>{{ t('common.delete') }}</el-button>
            </div>
          </SvnTargetOperations>
        </div>
      </Teleport>
    </header>
    <div v-if="!file" class="inspector-empty">{{ t('properties.selectTarget') }}</div>
    <template v-else>
      <section>
        <h3>{{ t('properties.general') }}</h3>
        <dl>
          <dt>{{ t('properties.name') }}</dt><dd :title="file">{{ file === '.' ? workspace.split(/[\\/]/).filter(Boolean).pop() : file.split('/').pop() }}</dd>
          <dt>{{ t('workspace.path') }}</dt><dd>{{ file }}</dd>
          <template v-if="details">
            <dt>{{ t('properties.kind') }}</dt><dd>{{ t(details.link_target !== null ? 'properties.symlink' : details.directory ? 'properties.directory' : 'properties.file') }}</dd>
            <template v-if="details.link_target !== null">
              <dt>{{ t('properties.linkTarget') }}</dt><dd>{{ details.link_target }}</dd>
            </template>
            <dt>{{ t('properties.size') }}</dt><dd>{{ details.size === null ? '—' : `${details.size.toLocaleString()} B` }}</dd>
            <dt>{{ t('properties.modified') }}</dt><dd>{{ details.modified ? new Date(details.modified).toLocaleString() : '—' }}</dd>
            <dt>{{ t('workspace.revision') }}</dt><dd>{{ details.info?.revision ?? '—' }}</dd>
          </template>
        </dl>
      </section>
      <p v-if="fetching" class="inspector-note" role="status">{{ t('properties.loading') }}</p>
      <p v-if="error" class="inspector-error" role="alert">{{ error }} <button type="button" :disabled="saving || fetching" @click="load">{{ t('properties.retry') }}</button></p>
      <template v-if="details && !fetching">
        <section v-if="details.info">
          <h3>{{ t('workspace.repository') }}</h3>
          <dl><dt>URL</dt><dd>{{ details.info.url }}</dd></dl>
        </section>
        <p v-if="!details.editable" class="inspector-note">{{ t(details.link_target !== null ? 'properties.linkReadOnly' : details.info ? 'properties.readOnly' : 'properties.addFirst') }}</p>
        <fieldset v-if="details.info" :disabled="disabled || saving || !details.editable">
          <section>
            <h3>{{ t('properties.title') }}</h3>
            <label v-for="field in commonFields" :key="field.name" class="property-field">
              <span :title="field.name">{{ t(`properties.${field.label}`) }}</span>
              <select v-if="field.options" :value="values[field.name] ?? ''" @change="setValue(field.name, ($event.target as HTMLSelectElement).value)">
                <option value="">{{ t('properties.unset') }}</option>
                <option v-for="option in field.options" :key="option" :value="option">{{ option === '*' ? t('properties.yes') : option }}</option>
              </select>
              <textarea v-else :value="values[field.name] ?? ''" rows="2" :aria-label="field.name"
                @input="setValue(field.name, ($event.target as HTMLTextAreaElement).value)" />
            </label>
          </section>
          <section>
            <h3>{{ t('properties.custom') }}</h3>
            <div v-for="property in customProperties" :key="property.name" class="custom-property">
              <label><span>{{ property.name }}</span>
                <small v-if="property.binary">{{ t('properties.binary') }}</small>
                <textarea v-else v-model="values[property.name]" rows="2" :aria-label="property.name" />
              </label>
              <button type="button" :disabled="property.binary" @click="delete values[property.name]">{{ t('common.delete') }}</button>
            </div>
            <div class="add-property">
              <input v-model="newName" :placeholder="t('properties.propertyName')" :aria-label="t('properties.propertyName')" @keydown.enter.prevent="addProperty" />
              <button type="button" :disabled="!newName.trim()" @click="addProperty">{{ t('common.add') }}</button>
            </div>
          </section>
          <div class="property-actions">
            <span>{{ t('properties.localHint') }}</span>
            <div><button type="button" :disabled="!dirty" @click="resetValues">{{ t('common.reset') }}</button>
              <button type="button" class="apply-button" :disabled="!dirty" @click="save">{{ t(saving ? 'properties.saving' : 'properties.apply') }}</button></div>
          </div>
        </fieldset>
      </template>
    </template>
  </aside>
</template>

<script setup lang="ts">
import SvnTargetOperations from './SvnTargetOperations.vue'
import SvnConflictActions from './SvnConflictActions.vue'
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { ElMessage } from 'element-plus/es/components/message/index'
import { useI18n } from 'vue-i18n'
import { save as selectExportPath } from '@tauri-apps/plugin-dialog'
import { propertyDrafts as drafts } from '@/utils/propertyDrafts'
import { svnPropertyDetails, svnSetProperty, svnDelete, deleteUnversioned, svnRestoreFileRevision, svnExport, svnAdd, svnCancelAdd } from '@/api/svn'
import { useSettings } from '@/composables/useSettings'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspace } from '@/composables/useWorkspace'
import type { PropertyDetails, SvnStatus } from '@/types'

const props = defineProps<{ workspace: string; file: string; status?: SvnStatus; disabled: boolean; showBlame?: boolean; actionsTarget?: string; actionsActive?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean]; dirty: [value: boolean]; blame: [file: string]; mutated: [action: 'delete' | 'restore' | 'refresh'] }>()
const { t } = useI18n()
const store = useWorkspaceStore()
const { refreshStatusAfterMutation } = useWorkspace()
const details = ref<PropertyDetails | null>(null)
const fetching = ref(false)
const saving = ref(false)
const error = ref('')
const exporting = ref(false)
const canExport = computed(() => Boolean(props.file && details.value?.info && !details.value.link_target
  && details.value.info.schedule !== 'delete' && !['deleted', 'missing'].includes(props.status?.status_code || '')
  && !fetching.value && !saving.value && !exporting.value && !props.disabled && !store.operationBusy))
async function exportTarget() {
  if (!canExport.value) return
  const workspace = props.workspace, file = props.file, targetKey = key.value
  const name = (file === '.' ? workspace : file).split(/[\\/]/).filter(Boolean).pop() || 'export'
  exporting.value = true; emit('busy', true); store.setOperationBusy(true)
  try {
    const destination = await selectExportPath({ title: t('properties.exportDirectory'), defaultPath: `${name}-export` })
    if (!destination || key.value !== targetKey || store.currentPath !== workspace) return
    const result = await svnExport(workspace, file, destination)
    if (!result.success) throw new Error(result.error || result.output)
    ElMessage.success(t('properties.exported', { path: destination }))
  } catch (err) { ElMessage.error(String(err)) }
  finally { exporting.value = false; emit('busy', false); store.setOperationBusy(false) }
}
const canBlame = computed(() => Boolean(props.file && details.value?.info && details.value.info.revision > 0
  && !details.value.directory && !details.value.link_target && !fetching.value && !saving.value && !props.disabled && !store.operationBusy))
function openBlame() { if (canBlame.value) emit('blame', props.file) }
const values = ref<Record<string, string>>({})
const original = ref<Record<string, string>>({})
const newName = ref('')
// Retain pending edits when another row is inspected.
let generation = 0
const key = computed(() => JSON.stringify([props.workspace, props.file]))
const dirty = computed(() => [...new Set([...Object.keys(original.value), ...Object.keys(values.value)])]
  .some(name => values.value[name] !== original.value[name]))
const canMutate = computed(() => Boolean(props.file && details.value && !dirty.value
  && !fetching.value && !saving.value && !props.disabled && !store.operationBusy && !store.statusIsStale))
const canResolveConflict = computed(() => canMutate.value && (props.status?.status_code === 'conflicted' || props.status?.prop_status === 'conflicted'))
const canDelete = computed(() => canMutate.value && props.file !== '.' && !['deleted', 'missing'].includes(props.status?.status_code || '') && details.value?.info?.schedule !== 'delete')
const canRestore = computed(() => canMutate.value && details.value?.editable && !details.value.link_target
  && (details.value.info?.revision ?? 0) > 0 && details.value.info?.schedule === 'normal')
const canAdd = computed(() => canMutate.value && props.file !== '.' && !details.value?.info
  && !['deleted', 'missing', 'external', 'obstructed'].includes(props.status?.status_code || ''))
const canCancelAdd = computed(() => canMutate.value && details.value?.info?.schedule === 'add' && !props.status?.history)
const addTarget = () => mutateTarget('add')
const cancelAddTarget = () => mutateTarget('cancelAdd')
const deleteTarget = () => mutateTarget('delete')
const restoreTarget = () => mutateTarget('restore')
async function mutateTarget(action: 'delete' | 'restore' | 'add' | 'cancelAdd') {
  if (!({ delete: canDelete.value, restore: canRestore.value, add: canAdd.value, cancelAdd: canCancelAdd.value })[action]) return
  const workspace = props.workspace, file = props.file, targetKey = key.value
  const unversioned = !details.value?.info
  const actionLabel = action === 'add' ? 'properties.addToVersionControl' : action === 'cancelAdd' ? 'properties.cancelAdd' : 'common.delete'
  let attempted = false, completed = false
  saving.value = true; emit('busy', true); store.setOperationBusy(true); error.value = ''
  try {
    const message = h('div', [
      h('p', t(action === 'add' ? 'properties.addHint' : action === 'cancelAdd' ? 'properties.cancelAddHint' : action === 'restore' ? details.value?.directory ? 'properties.restoreDirectoryHint' : 'properties.restoreHint' : unversioned ? 'workspace.deleteUnversionedConfirm' : 'properties.deleteHint')),
      h('code', { style: 'display:block;overflow-wrap:anywhere' }, file),
    ])
    let revision = 0
    if (action === 'restore') {
      const answer = await ElMessageBox.prompt(message, t('properties.restoreTo'), {
        inputPlaceholder: t('properties.revisionPlaceholder'), inputPattern: /^[1-9]\d*$/,
        inputValidator: value => Number.isSafeInteger(Number(value)) && Number(value) > 0,
        inputErrorMessage: t('properties.invalidRevision'),
        confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'),
        closeOnClickModal: false, distinguishCancelAndClose: true,
      })
      revision = Number(answer.value)
    } else {
      await ElMessageBox.confirm(message, t(actionLabel), {
        type: 'warning', confirmButtonType: action === 'delete' ? 'danger' : 'primary', confirmButtonText: t(actionLabel),
        cancelButtonText: t('common.cancel'), closeOnClickModal: false, distinguishCancelAndClose: true,
      })
    }
    if (key.value !== targetKey || store.currentPath !== workspace || store.statusIsStale) return
    const { settings } = useSettings()
    const filterRules = settings.gitignoreEnabled ? settings.filterRules.split('\n') : []
    attempted = true
    const result = action === 'add' ? await svnAdd(workspace, [file], filterRules)
      : action === 'cancelAdd' ? await svnCancelAdd(workspace, file)
      : action === 'restore' ? await svnRestoreFileRevision(workspace, file, revision)
      : unversioned ? await deleteUnversioned(workspace, [file]) : await svnDelete(workspace, [file])
    if (!result.success) throw new Error(result.error || result.output)
    completed = true
  } catch (err) {
    if (err !== 'cancel' && err !== 'close' && key.value === targetKey) error.value = String(err)
  } finally {
    if (attempted && store.currentPath === workspace) {
      try { if (!await refreshStatusAfterMutation()) error.value ||= t('properties.actionRefreshFailed') }
      catch (err) { error.value ||= String(err) }
    }
    saving.value = false; emit('busy', false); store.setOperationBusy(false)
    if (attempted && store.currentPath === workspace) {
      if (completed && action === 'delete') {
        // The parent remains inspectable after the selected entry is removed.
        emit('mutated', 'delete')
      } else {
        const failure = error.value
        if (key.value === targetKey) await load()
        error.value ||= failure
        emit('mutated', completed && action === 'restore' ? 'restore' : 'refresh')
      }
    }
    if (error.value) ElMessage.error(error.value)
    if (completed) ElMessage.success(t(action === 'add' ? 'properties.added' : action === 'cancelAdd' ? 'properties.addCancelled' : action === 'restore' ? 'properties.restored' : unversioned ? 'properties.removed' : 'properties.deleted'))
  }
}

async function targetOperationsMutated() { await load(); emit('mutated', 'refresh') }

const reportDirty = () => emit('dirty', dirty.value || [...drafts.keys()].some(entry => JSON.parse(entry)[0] === props.workspace))
watch(values, () => {
  if (fetching.value || saving.value || !details.value) return
  if (dirty.value) drafts.set(key.value, { ...values.value })
  else drafts.delete(key.value)
  reportDirty()
}, { deep: true })
const commonFields = computed(() => (details.value?.directory ? [
  { name: 'svn:ignore', label: 'ignore' },
  { name: 'svn:global-ignores', label: 'globalIgnores' },
] : [
  { name: 'svn:keywords', label: 'keywords' },
  { name: 'svn:eol-style', label: 'eol', options: ['native', 'LF', 'CRLF', 'CR'] },
  { name: 'svn:mime-type', label: 'mime' },
  { name: 'svn:executable', label: 'executable', options: ['*'] },
  { name: 'svn:needs-lock', label: 'needsLock', options: ['*'] },
]).filter(field => !details.value?.properties.some(p => p.name === field.name && p.binary)))
const customProperties = computed(() => {
  const common = new Set(commonFields.value.map(field => field.name))
  return [...new Set([...Object.keys(values.value), ...(details.value?.properties.filter(p => p.binary).map(p => p.name) || [])])]
    .filter(name => !common.has(name)).map(name => ({ name, binary: details.value?.properties.some(p => p.name === name && p.binary) }))
})
function setValue(name: string, value: string) {
  if (value === '') delete values.value[name]
  else values.value[name] = value
}
function resetValues() { values.value = { ...original.value }; drafts.delete(key.value) }
function addProperty() {
  const name = newName.value.trim()
  if (!name || /\s|\p{Cc}/u.test(name)) { error.value = t('properties.invalidName'); return }
  if (details.value?.properties.some(p => p.name === name && p.binary)) return
  if (!(name in values.value)) values.value[name] = ''
  newName.value = ''
}
async function load() {
  const request = ++generation
  const targetKey = key.value
  details.value = null; error.value = ''; newName.value = ''; original.value = {}; values.value = {}
  fetching.value = !!props.file
  if (!props.file) { reportDirty(); return }
  try {
    const result = await svnPropertyDetails(props.workspace, props.file)
    if (request !== generation) return
    details.value = result
    original.value = Object.fromEntries(result.properties.filter(p => !p.binary).map(p => [p.name, p.value]))
    values.value = { ...(drafts.get(targetKey) || original.value) }
  } catch (err) { if (request === generation) error.value = String(err) }
  finally { if (request === generation) { fetching.value = false; reportDirty() } }
}
watch(key, (_value, previous) => {
  if (previous && dirty.value) drafts.set(previous, { ...values.value })
  void load()
}, { immediate: true })
watch(() => props.status?.status_code, () => {
  if (!fetching.value && !saving.value) void load()
})
async function save() {
  if (props.disabled || saving.value || !details.value?.editable || store.operationBusy || !dirty.value) return
  const workspace = props.workspace, file = props.file, targetKey = key.value
  const pending = { ...values.value }, before = { ...original.value }
  const names = [...new Set([...Object.keys(before), ...Object.keys(pending)])].filter(name => before[name] !== pending[name])
  saving.value = true; emit('busy', true); store.setOperationBusy(true); error.value = ''
  let failure = ''
  try {
    for (const name of names) {
      await svnSetProperty(workspace, file, name, pending[name] ?? null)
      if (key.value === targetKey) {
        if (name in pending) original.value[name] = pending[name]
        else delete original.value[name]
      }
    }
    drafts.delete(targetKey)
  } catch (err) { failure = String(err) }
  finally {
    // Even a partially successful edit requires a fresh commit/status snapshot.
    try {
      if (store.currentPath === workspace && !await refreshStatusAfterMutation()) failure ||= t('properties.refreshFailed')
    } catch (err) { failure ||= String(err) } finally {
      saving.value = false; emit('busy', false); store.setOperationBusy(false)
    }
  }
  if (key.value === targetKey) {
    if (!failure) await load()
    else error.value = failure
  }
}
defineExpose({ reload: load })
onBeforeUnmount(() => { if (dirty.value) drafts.set(key.value, { ...values.value }); generation++ })
</script>

<style scoped>
.property-inspector { width: 300px; flex: 0 0 300px; min-height: 0; overflow: auto; border-left: 1px solid var(--commit-border); background: var(--el-bg-color); color: var(--commit-text); font-size: 12px; }
header { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; min-height: 36px; box-sizing: border-box; padding: 4px 12px; background: var(--commit-toolbar); border-bottom: 1px solid var(--commit-border); }
header > strong { flex-shrink: 0; white-space: nowrap; }
.target-actions { margin-left: auto; display: flex; align-items: center; gap: 12px; flex: 0 0 auto; min-width: 0; direction: ltr; }
.action-group { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.target-actions :deep(.el-button) { height: 26px; min-height: 26px; margin-left: 0; padding: 0 8px; border: 1px solid var(--el-border-color); border-radius: 4px; background: var(--el-fill-color-blank); font-size: 12px; white-space: nowrap; }
.target-actions :deep(.el-button:not(.is-disabled):hover) { border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.target-actions :deep(.el-button--danger) { border-color: var(--el-color-danger-light-5); background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
.target-actions :deep(.el-button--danger:not(.is-disabled):hover) { border-color: var(--el-color-danger); background: var(--el-color-danger-light-8); color: var(--el-color-danger); }
.target-actions :deep(.el-button--warning) { border-color: var(--el-color-warning-light-5); background: var(--el-color-warning-light-9); color: var(--el-color-warning); }
.target-actions :deep(.el-button--warning:not(.is-disabled):hover) { border-color: var(--el-color-warning); background: var(--el-color-warning-light-8); color: var(--el-color-warning); }
.target-actions :deep(.el-icon) { font-size: 14px; }
section { padding: 14px; border-bottom: 1px solid var(--el-border-color-lighter); }
h3 { margin: 0 0 12px; font-size: 12px; font-weight: 600; }
dl { display: grid; grid-template-columns: 65px minmax(0, 1fr); gap: 7px 10px; margin: 0; line-height: 1.5; }
dt { color: var(--commit-muted); text-align: right; } dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
.property-field { display: grid; grid-template-columns: 74px minmax(0, 1fr); align-items: start; gap: 8px; margin: 10px 0; }
.property-field > span { padding-top: 5px; text-align: right; color: var(--commit-muted); }
input, textarea, select { box-sizing: border-box; width: 100%; min-width: 0; padding: 5px 7px; border: 1px solid var(--el-border-color); border-radius: 3px; background: var(--el-fill-color-blank); color: var(--commit-text); font: inherit; }
textarea { resize: vertical; min-height: 43px; } select { height: 29px; }
input:focus, textarea:focus, select:focus { outline: 1px solid var(--el-color-primary); }
button { border: 1px solid var(--el-border-color); border-radius: 4px; padding: 4px 8px; background: var(--el-fill-color-blank); color: var(--commit-text); font: inherit; cursor: pointer; }
button:disabled, fieldset:disabled { opacity: .6; } button:disabled { cursor: default; }
.custom-property { margin-bottom: 12px; } .custom-property span { display: block; margin-bottom: 5px; overflow-wrap: anywhere; }
.custom-property button { margin-top: 4px; } small { display: block; color: var(--commit-muted); }
.add-property { display: flex; gap: 6px; } .add-property button { flex-shrink: 0; }
.property-actions { padding: 12px 14px; position: sticky; bottom: 0; border-top: 1px solid var(--commit-border); background: var(--el-bg-color); }
.property-actions > span { display: block; font-size: 11px; color: var(--commit-muted); line-height: 1.5; margin-bottom: 10px; }
.property-actions > div { display: flex; justify-content: flex-end; gap: 8px; }
.apply-button { background: var(--el-color-primary); border-color: var(--el-color-primary); color: white; }
.inspector-empty, .inspector-note { padding: 16px 14px; color: var(--commit-muted); line-height: 1.6; margin: 0; }
.inspector-error { padding: 12px 14px; color: var(--el-color-danger); overflow-wrap: anywhere; margin: 0; }
.dirty-dot { color: var(--el-color-warning); font-size: 10px; }
@media (max-width: 1000px) { .property-inspector { width: 260px; flex-basis: 260px; } }
</style>
