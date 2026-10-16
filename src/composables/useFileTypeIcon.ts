import { ref } from 'vue'
import { invoke, isTauri } from '@tauri-apps/api/core'

const icons = new Map<string, Promise<string | null>>()
const revision = ref(0)
// Re-read associations when returning to the app after changing system settings.
window.addEventListener('focus', () => { icons.clear(); revision.value++ })

export function fileTypeExtension(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop() || ''
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export function useFileTypeIcon() {
  function load(extension: string, directory: boolean): Promise<string | null> {
    if (!isTauri()) return Promise.resolve(null)
    const key = directory ? 'folder' : `file:${extension}`
    const existing = icons.get(key)
    if (existing) return existing
    // Cache in-flight requests too: hundreds of PHP rows use one system call.
    const pending = invoke<string | null>('file_type_icon', { extension, directory }).catch(() => null)
    if (icons.size >= 256) icons.delete(icons.keys().next().value!)
    icons.set(key, pending)
    return pending
  }
  return { revision, load }
}
