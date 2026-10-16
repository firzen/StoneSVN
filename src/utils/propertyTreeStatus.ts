import type { SvnStatus } from '@/types'

export function propertyTreeStatus(path: string, entries: Map<string, SvnStatus>): string {
  const entry = entries.get(path)
  if (entry) {
    if (entry.prop_status === 'modified' && ['normal', 'none', ''].includes(entry.status_code)) return 'modified'
    return statusSymbol(entry.status_code) ? entry.status_code : ''
  }
  let parent = path
  while (parent.includes('/')) {
    parent = parent.slice(0, parent.lastIndexOf('/'))
    if (entries.get(parent)?.status_code === 'unversioned') return 'unversioned'
  }
  return ''
}

export function statusSymbol(status: string): string {
  return ({ added: 'A', modified: 'M', unversioned: '?', deleted: 'D', missing: '!', conflicted: 'C', replaced: 'R', obstructed: '~' } as Record<string, string>)[status] || ''
}
