import { reactive } from 'vue'
import { workspaceChildren } from '@/api/svn'
import type { WorkspaceChild } from '@/types'

interface DirectoryState {
  children: WorkspaceChild[]
  loaded: boolean
  loading: boolean
  error: string
  generation: number
}
interface ProjectState {
  selected: string
  expanded: Set<string>
  directories: Map<string, DirectoryState>
  opened: boolean
}
export interface PropertyTreeRow extends WorkspaceChild {
  workspace: string
  depth: number
  type: 'entry' | 'loading' | 'error' | 'empty'
}
export const canExpandPropertyEntry = (entry: WorkspaceChild): boolean => entry.expandable ?? entry.directory
const STORAGE_KEY = 'orcasvn-property-tree'

export function createPropertyTree(read: typeof workspaceChildren, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const projects = reactive(new Map<string, ProjectState>())
  const requests = new Map<string, Promise<void>>()
  function project(workspace: string): ProjectState {
    let state = projects.get(workspace)
    if (!state) {
      let saved: { selected?: string; expanded?: string[] } = {}
      try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}')[workspace] || {} } catch { /* Ignore invalid preferences. */ }
      state = reactive({
        selected: typeof saved.selected === 'string' ? saved.selected : '.',
        expanded: new Set(Array.isArray(saved.expanded) ? saved.expanded.filter(path => typeof path === 'string') : []),
        directories: new Map<string, DirectoryState>(), opened: Array.isArray(saved.expanded),
      })
      projects.set(workspace, state)
    }
    return state
  }
  function persist() {
    if (!storage) return
    try {
      const previous = JSON.parse(storage.getItem(STORAGE_KEY) || '{}')
      for (const [workspace, state] of projects) previous[workspace] = { selected: state.selected, expanded: [...state.expanded] }
      storage.setItem(STORAGE_KEY, JSON.stringify(previous))
    } catch { /* Preferences must not interrupt navigation. */ }
  }
  function directory(workspace: string, path: string): DirectoryState {
    const state = project(workspace)
    if (!state.directories.has(path)) state.directories.set(path, { children: [], loaded: false, loading: false, error: '', generation: 0 })
    return state.directories.get(path)!
  }
  function load(workspace: string, path: string, force = false): Promise<void> {
    const state = directory(workspace, path)
    const key = JSON.stringify([workspace, path])
    if (!force && requests.has(key)) return requests.get(key)!
    if (!force && state.loaded) return Promise.resolve()
    const generation = ++state.generation
    state.loading = true; state.error = ''
    const request = read(workspace, path).then(children => {
      if (state.generation !== generation) return
      state.children = children; state.loaded = true
    }).catch(error => {
      if (state.generation === generation) state.error = String(error)
    }).finally(() => {
      if (state.generation === generation) state.loading = false
      if (requests.get(key) === request) requests.delete(key)
    })
    requests.set(key, request)
    return request
  }
  async function loadExpanded(workspace: string, path = '.', force = false): Promise<void> {
    const state = project(workspace)
    if (!state.expanded.has(path)) return
    await load(workspace, path, force)
    const node = directory(workspace, path)
    if (node.error || !state.expanded.has(path)) return
    await Promise.all(node.children.filter(child => canExpandPropertyEntry(child) && state.expanded.has(child.path))
      .map(child => loadExpanded(workspace, child.path, force)))
  }
  async function open(workspace: string) {
    const state = project(workspace)
    if (!state.opened) {
      state.opened = true
      if (!state.expanded.size) state.expanded.add('.')
    }
    await loadExpanded(workspace)
    persist()
  }
  async function toggle(workspace: string, path: string) {
    const state = project(workspace)
    state.opened = true
    if (state.expanded.has(path)) state.expanded.delete(path)
    else { state.expanded.add(path); void loadExpanded(workspace, path) }
    persist()
  }
  function select(workspace: string, path: string) { project(workspace).selected = path; persist() }
  function rows(workspaces: string[]): PropertyTreeRow[] {
    const result: PropertyTreeRow[] = []
    function append(workspace: string, child: WorkspaceChild, depth: number) {
      result.push({ ...child, workspace, depth, type: 'entry' })
      const state = project(workspace)
      if (!canExpandPropertyEntry(child) || !state.expanded.has(child.path)) return
      const node = directory(workspace, child.path)
      if (node.loading || node.error || (node.loaded && !node.children.length)) {
        result.push({ path: child.path, name: node.error, directory: false, workspace, depth: depth + 1,
          type: node.error ? 'error' : node.loading ? 'loading' : 'empty' })
      }
      // Keep cached children visible while a directory is being refreshed.
      for (const entry of node.children) append(workspace, entry, depth + 1)
    }
    for (const workspace of workspaces) append(workspace, { path: '.', name: workspace.split(/[\\/]/).filter(Boolean).pop() || workspace, directory: true }, 0)
    return result
  }
  async function refresh(workspace: string) {
    await loadExpanded(workspace, '.', true)
    // A removed target should not strand the inspector on an inaccessible item.
    const state = project(workspace)
    if (state.selected !== '.') {
      const parts = state.selected.split('/')
      for (let index = 0; index < parts.length; index++) {
        const parent = index ? parts.slice(0, index).join('/') : '.'
        const node = state.directories.get(parent)
        const path = parts.slice(0, index + 1).join('/')
        if (node?.loaded && !node.error && !node.children.some(child => child.path === path)) {
          state.selected = '.'; persist(); break
        }
      }
    }
  }
  return { project, directory, open, load, toggle, select, rows, refresh }
}

export const propertyTree = createPropertyTree(workspaceChildren, typeof localStorage === 'undefined' ? undefined : localStorage)
