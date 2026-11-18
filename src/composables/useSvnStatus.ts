type ConflictStatus = { status_code: string; prop_status: string }

export function isConflicted(file: ConflictStatus): boolean {
  return file.status_code === 'conflicted' || file.prop_status === 'conflicted'
}

/** Stable linear partition: prioritize conflicts without changing the SVN snapshot. */
export function prioritizeConflicts<T extends ConflictStatus>(files: readonly T[]): T[] {
  const conflicts: T[] = [], other: T[] = []
  for (const file of files) (isConflicted(file) ? conflicts : other).push(file)
  return conflicts.concat(other)
}

export function getStatusClass(statusCode: string): string {
  switch (statusCode) {
    case 'added': return 'status-added'
    case 'modified': return 'status-modified'
    case 'deleted': return 'status-deleted'
    case 'unversioned': return 'status-unversioned'
    case 'missing': return 'status-missing'
    case 'conflicted': return 'status-conflicted'
    case 'replaced': return 'status-replaced'
    case 'obstructed': return 'status-obstructed'
    default: return ''
  }
}

export function getStatusLabelKey(statusCode: string): string {
  switch (statusCode) {
    case 'added': return 'status.added'
    case 'modified': return 'status.modified'
    case 'deleted': return 'status.deleted'
    case 'unversioned': return 'status.unversioned'
    case 'missing': return 'status.missing'
    case 'conflicted': return 'status.conflicted'
    case 'replaced': return 'status.replaced'
    case 'obstructed': return 'status.obstructed'
    default: return 'common.noData'
  }
}
