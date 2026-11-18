<template>
  <el-button v-if="canResolve" class="conflict-resolve-button" size="small" type="warning" plain :title="iconOnly ? t('svnActions.resolve') : undefined" :aria-label="t('svnActions.resolve')" @click="openDialog"><el-icon><CircleCheck /></el-icon><span v-if="!iconOnly">{{ t('svnActions.resolve') }}</span></el-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import type { SvnStatus } from '@/types'

const props = defineProps<{ workspace: string; file: string; status?: SvnStatus; disabled?: boolean; iconOnly?: boolean }>()
defineEmits<{ mutated: [] }>()
const { t } = useI18n()
const router = useRouter()
const store = useWorkspaceStore()
const canResolve = computed(() => Boolean(props.file && !props.disabled && !store.operationBusy && !store.statusIsStale
  && store.currentPath === props.workspace
  && (props.status?.status_code === 'conflicted' || props.status?.prop_status === 'conflicted')))
function openDialog() {
  if (canResolve.value) void router.push({ name: 'diff', query: { path: props.file } })
}
</script>
