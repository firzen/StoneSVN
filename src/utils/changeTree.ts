import type { SvnStatus } from '../types'

export const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
export const isWithinDirectory = (path: string, directory: string) => {
  const target = normalizePath(path)
  const parent = normalizePath(directory)
  return !parent || parent === '.' || target === parent || target.startsWith(`${parent}/`)
}
export interface ChangeNode {
  path: string
  label: string
  entry?: SvnStatus
  children: ChangeNode[]
  targets: string[]
}
export const isDirectoryChange = (node: ChangeNode): boolean => Boolean(node.entry?.directory || node.children.length || !node.entry)
export function buildChangeTree(entries: SvnStatus[], scope = ''): ChangeNode[] {
  const root: ChangeNode = { path: scope || '.', label: scope || '.', children: [], targets: [] }
  const nodes = new Map<string, ChangeNode>([[normalizePath(scope) || '.', root]])
  const ensure = (path: string): ChangeNode => {
    const existing = nodes.get(path)
    if (existing) return existing
    const split = path.lastIndexOf('/')
    const parent = split < 0 ? root : ensure(path.slice(0, split))
    const node: ChangeNode = { path, label: path.slice(split + 1), children: [], targets: [] }
    nodes.set(path, node)
    parent.children.push(node)
    return node
  }
  entries.filter(entry => isWithinDirectory(entry.path, scope)).forEach(entry => {
    ensure(normalizePath(entry.path)).entry = entry
  })
  const finish = (node: ChangeNode): string[] => {
    node.children.sort((a, b) => Number(b.children.length > 0) - Number(a.children.length > 0) || a.label.localeCompare(b.label))
    node.targets = [...(node.entry ? [node.entry.path] : []), ...node.children.flatMap(finish)]
    return node.targets
  }
  finish(root)
  return root.targets.length ? [root] : []
}

// Preserve original targets on visible groups so filtering never silently
// changes the scope of a directory checkbox or discards hidden selections.
export function filterChangeTree(nodes: ChangeNode[], visiblePaths: Set<string>): ChangeNode[] {
  return nodes.filter(node => node.targets.some(path => visiblePaths.has(path))).map(node => ({
    ...node,
    children: filterChangeTree(node.children, visiblePaths),
  }))
}

export interface ChangeTreeRow {
  node: ChangeNode
  depth: number
}

export function flattenChangeTree(nodes: ChangeNode[], collapsed: ReadonlySet<string> = new Set()): ChangeTreeRow[] {
  const rows: ChangeTreeRow[] = []
  const visit = (children: ChangeNode[], depth: number) => {
    for (const node of children) {
      rows.push({ node, depth })
      if (!collapsed.has(node.path)) visit(node.children, depth + 1)
    }
  }
  visit(nodes, 0)
  return rows
}
