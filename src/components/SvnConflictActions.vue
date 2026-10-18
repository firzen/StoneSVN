<template>
  <el-button v-if="canResolve" size="small" type="warning" plain @click="openDialog"><el-icon><CircleCheck /></el-icon>{{ t('svnActions.resolve') }}</el-button>
  <el-dialog v-model="visible" :title="t('svnActions.resolve')" width="min(480px, calc(100vw - 32px))"
    append-to-body :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy">
    <code class="conflict-path">{{ targetFile }}</code>
    <p>{{ t('svnActions.resolveHint') }}</p>
    <label class="resolution-choice">{{ t('svnActions.resolution') }}
      <select v-model="strategy" :disabled="busy">
        <option value="working">{{ t('svnActions.resolveWorking') }}</option>
        <option v-if="!status?.directory" value="mine-full">{{ t('svnActions.resolveMine') }}</option>
        <option v-if="!status?.directory" value="theirs-full">{{ t('svnActions.resolveTheirs') }}</option>
      </select>
    </label>
    <p>{{ t(strategy === 'working' ? 'svnActions.resolveWorkingHint' : 'svnActions.resolveReplaceHint') }}</p>
    <template #footer>
      <el-button :disabled="busy" @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="warning" :loading="busy" @click="resolveTarget">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus/es/components/message/index'
import { svnResolve } from '@/api/svn'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorkspace } from '@/composables/useWorkspace'
import type { SvnStatus } from '@/types'

const props = defineProps<{ workspace: string; file: string; status?: SvnStatus; disabled?: boolean }>()
const emit = defineEmits<{ mutated: [] }>()
const { t } = useI18n()
const store = useWorkspaceStore()
const { refreshStatusAfterMutation } = useWorkspace()
const visible = ref(false), busy = ref(false), strategy = ref('working')
const targetFile = ref(''), targetWorkspace = ref('')
const canResolve = computed(() => Boolean(props.file && !props.disabled && !store.operationBusy && !store.statusIsStale
  && (props.status?.status_code === 'conflicted' || props.status?.prop_status === 'conflicted')))
function openDialog() {
  if (!canResolve.value) return
  targetFile.value = props.file; targetWorkspace.value = props.workspace; strategy.value = 'working'; visible.value = true
}
watch(() => [props.workspace, props.file], () => { if (!busy.value) visible.value = false })
async function resolveTarget() {
  if (!visible.value || !canResolve.value || targetFile.value !== props.file || targetWorkspace.value !== props.workspace
    || store.currentPath !== props.workspace) return
  const workspace = targetWorkspace.value, file = targetFile.value
  busy.value = true; store.setOperationBusy(true)
  let failure = '', completed = false
  try {
    const result = await svnResolve(workspace, [file], strategy.value)
    if (!result.success) throw new Error(result.error || result.output)
    completed = true
  } catch (err) { failure = String(err) }
  finally {
    if (store.currentPath === workspace) {
      try { if (!await refreshStatusAfterMutation()) failure ||= t('properties.actionRefreshFailed') }
      catch (err) { failure ||= String(err) }
    }
    busy.value = false; store.setOperationBusy(false); visible.value = false
    if (store.currentPath === workspace) emit('mutated')
  }
  if (failure) ElMessage.error(failure)
  else if (completed) ElMessage.success(t('svnActions.resolved'))
}
</script>

<style scoped>
.conflict-path { display: block; overflow-wrap: anywhere; }
.resolution-choice { display: flex; flex-direction: column; gap: 8px; }
select { width: 100%; padding: 7px; background: var(--el-bg-color); color: var(--el-text-color-primary); border: 1px solid var(--el-border-color); border-radius: 4px; }
</style>
