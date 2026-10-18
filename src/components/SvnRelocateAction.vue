<template>
  <el-button v-if="store.currentPath && !store.operationBusy" size="small" text @click="relocateTarget">{{ t('svnActions.relocate') }}</el-button>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { ElMessage } from 'element-plus/es/components/message/index'
import { svnInfo, svnRelocate } from '@/api/svn'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspace } from '@/composables/useWorkspace'
import { invalidateWorkspaceSnapshot } from '@/utils/workspaceSnapshot'
import { invalidateSvnInfoMetadata } from '@/utils/svnInfoCache'

const { t } = useI18n()
const store = useWorkspaceStore()
const { refreshStatusAfterMutation } = useWorkspace()
function validUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:', 'svn:', 'svn+ssh:', 'file:'].includes(url.protocol) && !url.search && !url.hash
  } catch { return false }
}
async function relocateTarget() {
  const workspace = store.currentPath
  if (!workspace || store.operationBusy) return
  store.setOperationBusy(true)
  let attempted = false, completed = false, failure = ''
  try {
    const info = await svnInfo(workspace)
    if (store.currentPath !== workspace) return
    const answer = await ElMessageBox.prompt(h('div', [h('p', t('svnActions.relocateHint')), h('code', { style: 'overflow-wrap:anywhere' }, info.url)]),
      t('svnActions.relocate'), { inputValue: info.url, inputValidator: value => validUrl(value) || t('svnActions.invalidUrl'),
        confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), closeOnClickModal: false, distinguishCancelAndClose: true })
    const url = answer.value.trim()
    if (store.currentPath !== workspace || !validUrl(url) || url === info.url) return
    attempted = true
    const result = await svnRelocate(workspace, url)
    if (!result.success) throw new Error(result.error || result.output)
    completed = true
  } catch (err) { if (err !== 'cancel' && err !== 'close') failure = String(err) }
  finally {
    if (attempted) {
      // Relocate can affect other saved subdirectories of this working copy.
      for (const path of new Set([workspace, ...store.recentWorkspaces])) {
        if (path === workspace || path.startsWith(`${workspace}/`) || path.startsWith(`${workspace}\\`)) { invalidateSvnInfoMetadata(path); invalidateWorkspaceSnapshot(path) }
      }
      if (store.currentPath === workspace) {
        try { if (!await refreshStatusAfterMutation()) failure ||= t('properties.actionRefreshFailed') }
        catch (err) { failure ||= String(err) }
      }
    }
    store.setOperationBusy(false)
  }
  if (failure) ElMessage.error(failure)
  else if (completed) ElMessage.success(t('svnActions.relocated'))
}
</script>
