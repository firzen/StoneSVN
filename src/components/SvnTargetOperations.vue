<template>
  <slot :can-move="canMove" :can-revert="canRevert" :has-draft="hasDraft" :move-target="moveTarget" :revert-target="revertTarget" />
</template>

<script setup lang="ts">
import { computed, h, getCurrentInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { ElMessage } from 'element-plus/es/components/message/index'
import { svnMove, svnRevert, svnRevertPreview } from '@/api/svn'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspace } from '@/composables/useWorkspace'
import { propertyDrafts } from '@/utils/propertyDrafts'
import { propertyTree } from '@/composables/usePropertyTree'
import RevertImpactTree from './RevertImpactTree.vue'
import type { PropertyDetails, SvnStatus } from '@/types'

const props = defineProps<{ workspace: string; file: string; details: PropertyDetails | null; status?: SvnStatus; disabled: boolean }>()
const emit = defineEmits<{ mutated: [action: 'refresh'] }>()
const { t } = useI18n()
const messageContext = getCurrentInstance()?.appContext
const store = useWorkspaceStore()
const { refreshStatusAfterMutation } = useWorkspace()
const within = (path: string) => props.file === '.' || path === props.file || path.startsWith(`${props.file}/`)
const hasDraft = computed(() => [...propertyDrafts.keys()].some(key => {
  const [workspace, file] = JSON.parse(key)
  return workspace === props.workspace && within(file)
}))
const available = computed(() => Boolean(props.details?.info && !props.details.link_target && !props.disabled && !hasDraft.value
  && !store.operationBusy && !store.statusIsStale))
const canMove = computed(() => available.value && props.file !== '.' && props.details?.info?.schedule === 'normal'
  && !['deleted', 'missing', 'conflicted', 'obstructed', 'external'].includes(props.status?.status_code || '')
  && props.status?.prop_status !== 'conflicted')
const canRevert = computed(() => available.value && store.statusList.some(entry => within(entry.path.replace(/\\/g, '/'))
  && (!['normal', 'none', '', 'unversioned', 'ignored', 'external'].includes(entry.status_code)
    || ['modified', 'conflicted'].includes(entry.prop_status))))
function validDestination(value: string, rename: boolean) {
  const path = value.trim().replace(/\\/g, '/')
  return Boolean(path && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.includes('://')
    && !(rename && path.includes('/'))
    && path.split('/').every(part => part && !['.', '..', '.svn'].includes(part.toLowerCase())))
}
async function perform(action: 'move' | 'revert', rename = false) {
  if (!(action === 'move' ? canMove.value : canRevert.value)) return
  const workspace = props.workspace, file = props.file
  const isCurrent = () => store.currentPath === workspace && props.workspace === workspace && props.file === file
  store.setOperationBusy(true)
  let attempted = false, destination = '', failure = '', completed = false
  let revertPreview: SvnStatus[] | undefined
  try {
    if (action === 'move') {
      const slash = file.lastIndexOf('/')
      const answer = await ElMessageBox.prompt(
        h('div', [h('p', t(rename ? 'svnActions.renameHint' : 'svnActions.moveHint')), h('code', file)]),
        t(rename ? 'svnActions.rename' : 'svnActions.move'), {
          inputValue: rename ? file.slice(slash + 1) : file, inputValidator: value => validDestination(value, rename) || t('svnActions.invalidDestination'),
          confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), closeOnClickModal: false, distinguishCancelAndClose: true,
        },
      )
      if (!validDestination(answer.value, rename)) return
      const value = answer.value.trim().replace(/\\/g, '/')
      destination = rename && slash >= 0 ? `${file.slice(0, slash + 1)}${value}` : value
      if (destination === file) return
    } else {
      revertPreview = await svnRevertPreview(workspace, file)
      if (!isCurrent()) return
      if (!revertPreview.length) { ElMessage.success(t('workspace.noChanges')); return }
      await ElMessageBox.confirm(h('div', [
        h('p', t(props.details?.directory ? 'svnActions.revertDirectoryHint' : 'workspace.revertFileConfirm')),
        h('code', { style: 'display:block;overflow-wrap:anywhere' }, file),
        h(RevertImpactTree, { entries: revertPreview, root: file }),
      ]),
        t('svnActions.revertLocal'), { type: 'warning', customClass: 'svn-revert-confirm', confirmButtonType: 'danger', confirmButtonText: t('common.revert'), cancelButtonText: t('common.cancel'), closeOnClickModal: false, distinguishCancelAndClose: true }, messageContext)
    }
    if (!isCurrent() || store.statusIsStale) return
    attempted = true
    const result = action === 'move' ? await svnMove(workspace, file, destination) : await svnRevert(workspace, [file], revertPreview)
    if (!result.success) throw new Error(result.error || result.output)
    completed = true
  } catch (err) { if (err !== 'cancel' && err !== 'close') failure = String(err) }
  finally {
    if (attempted && store.currentPath === workspace) {
      try { if (!await refreshStatusAfterMutation()) failure ||= t('properties.actionRefreshFailed') }
      catch (err) { failure ||= String(err) }
    }
    store.setOperationBusy(false)
    if (attempted && store.currentPath === workspace) {
      if (completed && action === 'move' && isCurrent()) {
        const state = propertyTree.project(workspace)
        state.expanded.add('.')
        const parts = destination.split('/')
        for (let index = 1; index < parts.length; index++) state.expanded.add(parts.slice(0, index).join('/'))
        propertyTree.select(workspace, destination)
      }
      emit('mutated', 'refresh')
    }
  }
  if (failure) ElMessage.error(failure)
  else if (completed) ElMessage.success(t(action === 'move' ? 'svnActions.moved' : 'svnActions.reverted'))
}
const moveTarget = (rename: boolean) => perform('move', rename)
const revertTarget = () => perform('revert')
</script>
