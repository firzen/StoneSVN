import type { SvnStatus } from '@/types'

const summaryOrder = ['modified', 'added', 'unversioned', 'deleted']

export function buildPropertyTreeDescendantStatuses(entries: Map<string, SvnStatus>): Map<string, string[]> {
  const summaries = new Map<string, Set<string>>()
  for (const path of entries.keys()) {
    const status = propertyTreeStatus(path, entries)
    if (!summaryOrder.includes(status) || path === '.') continue
    let parent = path
    while (parent !== '.') {
      const slash = parent.lastIndexOf('/')
      parent = slash < 0 ? '.' : parent.slice(0, slash)
      if (!summaries.has(parent)) summaries.set(parent, new Set())
      summaries.get(parent)!.add(status)
    }
  }
  return new Map([...summaries].map(([path, statuses]) => [path, summaryOrder.filter(status => statuses.has(status))]))
}

export function propertyTreeStatuses(own: string, descendants: string[]): string[] {
  const statuses = new Set(descendants)
  if (own) statuses.add(own)
  return [...summaryOrder.filter(status => statuses.has(status)), ...[...statuses].filter(status => !summaryOrder.includes(status))]
}

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
