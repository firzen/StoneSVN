import type { SvnStatus } from '@/types'

// A status list is an immutable snapshot. Preserve its identity on unchanged
// background scans so cached views do not rebuild their lists and trees.
export function sameStatusSnapshot(previous: SvnStatus[], next: SvnStatus[]): boolean {
  if (previous === next) return true
  if (previous.length !== next.length) return false
  return previous.every((entry, index) => {
    const other = next[index]
    return entry.path === other.path && entry.status === other.status
      && entry.status_code === other.status_code && entry.prop_status === other.prop_status
      && entry.locked === other.locked && entry.history === other.history && entry.switched === other.switched
  })
}
