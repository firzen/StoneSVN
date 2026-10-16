import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import type { SvnStatus, SvnInfo } from '@/types'
import { invalidateWorkspaceSnapshot } from '@/utils/workspaceSnapshot'
import type { GitignorePattern } from '@/utils/gitignore'
import { sameStatusSnapshot } from '@/utils/statusSnapshot'

const LAST_WORKSPACE_KEY = 'orcasvn-last-workspace'
const RECENT_WORKSPACES_KEY = 'orcasvn-recent-workspaces'
const PROJECT_SUMMARIES_KEY = 'orcasvn-project-summaries'
type ProjectSummary = { count: number; scannedAt: number }

function readProjectSummaries(): Record<string, ProjectSummary> {
  try {
    const stored = JSON.parse(localStorage.getItem(PROJECT_SUMMARIES_KEY) || '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, ProjectSummary] => {
      const value = entry[1] as ProjectSummary | null
      return !!value && Number.isInteger(value.count) && value.count >= 0
        && Number.isFinite(value.scannedAt) && value.scannedAt > 0
    }))
  } catch { return {} }
}

function readRecentWorkspaces(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_WORKSPACES_KEY) || '[]')
    if (Array.isArray(stored)) {
      return [...new Set(stored.filter((path): path is string => typeof path === 'string' && path.length > 0))]
    }
  } catch {
    // Ignore malformed data from older/manual installations.
  }
  return []
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const currentPath = ref<string | null>(null)
  const recentWorkspaces = ref<string[]>(readRecentWorkspaces())
  const svnInfo = ref<SvnInfo | null>(null)
  const statusList = shallowRef<SvnStatus[]>([])
  const isLoading = ref(false)
  const statusIsStale = ref(false)
  const error = ref<string | null>(null)
  const gitignorePatterns = ref<GitignorePattern[]>([])
  const operationBusy = ref(false)
  const projectSummaries = ref<Record<string, ProjectSummary>>(readProjectSummaries())
  const commitDrafts = ref<Record<string, { message: string; files: string[]; search: string; filter: 'all' | 'committable' | 'unversioned'; scroll?: number; collapsed?: string[]; activeRow?: string }>>({})

  const hasChanges = computed(() => {
    return statusList.value.some(s => s.status_code !== 'normal' && s.status_code !== '')
  })

  const modifiedCount = computed(() => {
    return statusList.value.filter(s => s.status_code === 'modified').length
  })

  const changedCount = computed(() => {
    const changedStatuses = new Set(['modified', 'added', 'deleted', 'replaced'])
    return statusList.value.filter(s => changedStatuses.has(s.status_code) || s.prop_status === 'modified').length
  })

  const addedCount = computed(() => {
    return statusList.value.filter(s => s.status_code === 'added').length
  })

  const deletedCount = computed(() => {
    return statusList.value.filter(s => s.status_code === 'deleted').length
  })

  const unversionedCount = computed(() => {
    return statusList.value.filter(s => s.status_code === 'unversioned').length
  })

  const conflictedCount = computed(() => {
    return statusList.value.filter(s => s.status_code === 'conflicted' || s.prop_status === 'conflicted').length
  })

  const missingCount = computed(() => {
    return statusList.value.filter(s => s.status_code === 'missing').length
  })

  function rememberWorkspace(path: string) {
    if (!recentWorkspaces.value.includes(path)) recentWorkspaces.value.push(path)
    localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(recentWorkspaces.value))
    localStorage.setItem(LAST_WORKSPACE_KEY, path)
  }

  function setCurrentPath(path: string, remember = true) {
    currentPath.value = path
    if (remember) rememberWorkspace(path)
  }

  function getLastWorkspacePath() {
    return localStorage.getItem(LAST_WORKSPACE_KEY)
  }

  function setStatusList(list: SvnStatus[]) {
    if (!sameStatusSnapshot(statusList.value, list)) statusList.value = list
  }

  function setSvnInfo(info: SvnInfo | null) {
    svnInfo.value = info
  }

  function setStatusIsStale(value: boolean) {
    statusIsStale.value = value
    if (!value && currentPath.value) {
      projectSummaries.value[currentPath.value] = {
        count: statusList.value.filter(file => !['normal', 'none', ''].includes(file.status_code)
          || ['modified', 'conflicted'].includes(file.prop_status)).length,
        scannedAt: Date.now(),
      }
      saveProjectSummaries()
    }
  }

  function saveProjectSummaries() {
    try { localStorage.setItem(PROJECT_SUMMARIES_KEY, JSON.stringify(projectSummaries.value)) }
    catch { /* A cached count must not fail a successful SVN scan. */ }
  }

  function setOperationBusy(value: boolean) { operationBusy.value = value }

  function moveProject(path: string, target: string) {
    const paths = [...recentWorkspaces.value]
    const from = paths.indexOf(path), to = paths.indexOf(target)
    if (from < 0 || to < 0 || from === to) return
    paths.splice(from, 1)
    paths.splice(to, 0, path)
    recentWorkspaces.value = paths
    localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(paths))
  }

  function setLoading(value: boolean) {
    isLoading.value = value
  }

  function setError(value: string | null) {
    error.value = value
  }

  function setGitignorePatterns(patterns: GitignorePattern[]) {
    gitignorePatterns.value = patterns
  }

  function clearWorkspace() {
    localStorage.removeItem(LAST_WORKSPACE_KEY)
    currentPath.value = null
    svnInfo.value = null
    statusList.value = []
    statusIsStale.value = false
    error.value = null
    gitignorePatterns.value = []
  }

  function removeRecentWorkspace(path: string) {
    invalidateWorkspaceSnapshot(path)
    recentWorkspaces.value = recentWorkspaces.value.filter(item => item !== path)
    delete projectSummaries.value[path]
    saveProjectSummaries()
    localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(recentWorkspaces.value))
    if (currentPath.value === path) clearWorkspace()
  }

  return {
    currentPath,
    recentWorkspaces,
    projectSummaries,
    commitDrafts,
    operationBusy,
    setOperationBusy,
    moveProject,
    svnInfo,
    statusList,
    isLoading,
    statusIsStale,
    setStatusIsStale,
    error,
    hasChanges,
    modifiedCount,
    changedCount,
    addedCount,
    deletedCount,
    unversionedCount,
    conflictedCount,
    missingCount,
    gitignorePatterns,
    setCurrentPath,
    rememberWorkspace,
    removeRecentWorkspace,
    getLastWorkspacePath,
    setStatusList,
    setSvnInfo,
    setLoading,
    setError,
    setGitignorePatterns,
    clearWorkspace,
  }
})
