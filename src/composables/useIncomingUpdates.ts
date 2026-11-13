import { computed, reactive } from 'vue'
import { svnIncomingState } from '@/api/svn'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSettings } from '@/composables/useSettings'
import type { SvnLogEntry } from '@/types'

export const incomingCheckIntervalMs = 30_000
type CheckState = {
  status: 'unchecked' | 'checking' | 'ready' | 'failed'
  revision: number
  logs: SvnLogEntry[]
  total: number | null
  checkedAt: number
  attemptedAt: number
  blocked: boolean
  error: string | null
  limit: number
}
const states = reactive(new Map<string, CheckState>())
const pending = new Map<string, { promise: Promise<boolean>; interactive: boolean }>()

function stateFor(path: string): CheckState {
  if (!states.has(path)) states.set(path, {
    status: 'unchecked', revision: 0, logs: [], total: null,
    checkedAt: 0, attemptedAt: 0, blocked: false, error: null, limit: 0,
  })
  return states.get(path)!
}

export function useIncomingUpdates() {
  const store = useWorkspaceStore()
  const { settings } = useSettings()
  const state = computed(() => store.currentPath ? stateFor(store.currentPath) : null)

  async function check(path: string, force = false, interactive = false): Promise<boolean> {
    const cached = stateFor(path)
    const existing = pending.get(path)
    if (existing) {
      const success = await existing.promise
      // A manual retry may resolve a certificate problem that a silent check cannot.
      return !success && interactive && !existing.interactive ? check(path, true, true) : success
    }
    const limit = settings.logLimit || 50
    if (!force && (cached.blocked || (cached.limit === limit && Date.now() - cached.attemptedAt < incomingCheckIntervalMs))) {
      return cached.status === 'ready'
    }
    cached.status = 'checking'
    cached.attemptedAt = Date.now()
    cached.limit = limit
    const request = { interactive, promise: Promise.resolve(false) }
    request.promise = (async () => {
      try {
        const result = await svnIncomingState(path, limit, interactive)
        if (pending.get(path) !== request) return false
        Object.assign(cached, {
          status: 'ready', revision: result.revision, logs: result.logs, total: result.total,
          checkedAt: Date.now(), blocked: false, error: null,
        })
        return true
      } catch (error) {
        if (pending.get(path) !== request) return false
        cached.status = 'failed'
        cached.error = String(error)
        cached.blocked = /E(?:170001|215004|230001|120171)|authentication|authorization|certificate/i.test(cached.error)
        return false
      } finally {
        if (pending.get(path) === request) pending.delete(path)
      }
    })()
    pending.set(path, request)
    return request.promise
  }

  function invalidate(path: string) {
    // Detach an older request so pre-mutation history cannot restore a stale badge.
    pending.delete(path)
    states.delete(path)
  }

  return { state, check, invalidate }
}
