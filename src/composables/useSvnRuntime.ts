import { reactive } from 'vue'
import { configureSvnExecutable } from '@/api/svn'
import { useSettings } from '@/composables/useSettings'

const runtime = reactive({ initialized: false, ready: false, checking: false, version: '', error: '', path: '' })
let pending: Promise<boolean> | null = null

export function useSvnRuntime() {
  function configure(path: string): Promise<boolean> {
    if (pending) return pending
    runtime.checking = true
    runtime.error = ''
    runtime.path = path.trim()
    pending = (async () => {
      try {
        const version = await configureSvnExecutable(path)
        useSettings().updateSettings({ svnPath: path.trim() })
        runtime.version = version
        runtime.initialized = true
        runtime.ready = true
        return true
      } catch (error) {
        runtime.error = String(error)
        runtime.ready = false
        return false
      } finally {
        runtime.checking = false
        pending = null
      }
    })()
    return pending
  }
  return { runtime, configure }
}
