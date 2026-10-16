<template>
  <span class="file-type-icon" :class="{ 'context-folder-icon': directory && muted }" aria-hidden="true">
    <img v-if="source && !failed" :src="source" alt="" draggable="false" @error="failed = true" />
    <svg v-else viewBox="0 0 20 22" focusable="false">
      <g v-if="directory">
        <path d="M1 5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v12H1Z" fill="#72bde5" stroke="#4b9cc9" stroke-width=".6" />
        <rect x="1" y="7" width="18" height="12" rx="1" fill="#a1d9f3" stroke="#72b4d7" stroke-width=".6" />
        <path d="M2 8h16" stroke="#d2f0fd" />
      </g>
      <g v-else>
        <path d="M3 1.5h9l5 5v14H3Z" fill="#fafbfc" stroke="#bac2ca" stroke-width=".6" />
        <path d="M12 1.5v5h5" fill="#e8ecf0" stroke="#bac2ca" stroke-width=".6" />
        <path d="M5.5 10h9m-9 2.5h9m-9 2.5h9m-9 2.5h6" stroke="#a5b0bb" stroke-width=".7" />
      </g>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { fileTypeExtension, useFileTypeIcon } from '@/composables/useFileTypeIcon'

const props = defineProps<{ path: string; directory?: boolean; muted?: boolean }>()
const source = ref<string | null>(null)
const failed = ref(false)
const { revision, load } = useFileTypeIcon()
watch(() => [fileTypeExtension(props.path), !!props.directory, revision.value] as const,
  async ([extension, directory], _, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })
    source.value = null
    failed.value = false
    const icon = await load(extension, directory)
    if (!cancelled) source.value = icon
  }, { immediate: true })
</script>

<style scoped>
.file-type-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 16px; width: 16px; height: 18px; }
.file-type-icon img { display: block; width: 16px; height: 16px; object-fit: contain; }
.file-type-icon svg { display: block; width: 16px; height: 18px; }
.context-folder-icon { opacity: .5; filter: saturate(.75); }
</style>
