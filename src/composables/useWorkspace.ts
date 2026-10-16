import { useWorkspaceStore } from '@/stores/workspace'
import { svnStatus, svnInfo, svnLocalRevision } from '@/api/svn'
import { open } from '@tauri-apps/plugin-dialog'
import { useSettings } from '@/composables/useSettings'
import { parseFilterRules } from '@/utils/gitignore'
import { filterByGitignoreAsync } from '@/utils/gitignoreWorker'
import { cacheSvnInfoMetadata, getCachedSvnInfoMetadata, type SvnInfoMetadata } from '@/utils/svnInfoCache'
import { cacheWorkspaceSnapshot, getWorkspaceSnapshot, invalidateWorkspaceSnapshot } from '@/utils/workspaceSnapshot'
import type { SvnInfo } from '@/types'

let workspaceRequestGeneration = 0
let pendingRequest: { path: string; generation: number; force: boolean; promise: Promise<boolean> } | null = null
let lastRefresh: { path: string; generation: number; timestamp: number } | null = null

function trackRequest(path: string, operation: () => Promise<boolean>, force = false): Promise<boolean> {
  const promise = operation()
  const request = { path, generation: workspaceRequestGeneration, force, promise }
  pendingRequest = request
  request.promise = promise.then(success => {
    if (success && request.generation === workspaceRequestGeneration) {
      lastRefresh = { path, generation: request.generation, timestamp: Date.now() }
    }
    return success
  }).finally(() => {
    if (pendingRequest === request) pendingRequest = null
  })
  return request.promise
}

function loadFilterRules(
  store: ReturnType<typeof useWorkspaceStore>,
  isCurrent: () => boolean,
): void {
  if (!isCurrent()) return
  const { settings } = useSettings()
  store.setGitignorePatterns(settings.gitignoreEnabled ? parseFilterRules(settings.filterRules ?? '.gitignore') : [])
}

function toSvnInfoMetadata(info: SvnInfo): SvnInfoMetadata {
  const { revision: _revision, ...metadata } = info
  return metadata
}

async function loadWorkspaceInfo(path: string, isCurrent: () => boolean): Promise<SvnInfo | null> {
  const cachedMetadata = getCachedSvnInfoMetadata(path)
  const freshMetadataRequest = cachedMetadata ? null : svnInfo(path)
  const [revision, freshInfo] = await Promise.all([
    svnLocalRevision(path),
    freshMetadataRequest || Promise.resolve(null),
  ])

  if (!isCurrent()) return null

  const metadata = cachedMetadata || (freshInfo ? toSvnInfoMetadata(freshInfo) : null)
  if (!metadata) throw new Error('无法获取 SVN 工作区元信息')
  if (!cachedMetadata && freshInfo) cacheSvnInfoMetadata(path, metadata)

  return { ...metadata, revision }
}

type InfoRequestResult =
  | { ok: true; info: SvnInfo | null }
  | { ok: false; error: unknown }

function requestWorkspaceInfo(path: string, isCurrent: () => boolean): Promise<InfoRequestResult> {
  return loadWorkspaceInfo(path, isCurrent).then(
    info => ({ ok: true, info }),
    error => ({ ok: false, error }),
  )
}

export function useWorkspace() {
  const workspaceStore = useWorkspaceStore()

  async function performLoadWorkspace(path: string): Promise<boolean> {
    const generation = ++workspaceRequestGeneration
    const previousPath = workspaceStore.currentPath
    const previousStatusList = workspaceStore.statusList
    const previousSvnInfo = workspaceStore.svnInfo
    const previousStatusIsStale = workspaceStore.statusIsStale
    const { settings } = useSettings()
    const snapshot = getWorkspaceSnapshot(path, settings.gitignoreEnabled, settings.filterRules ?? '.gitignore')
    const isCurrentGeneration = () => generation === workspaceRequestGeneration
    const isCurrent = () => (
      isCurrentGeneration() && workspaceStore.currentPath === path
    )

    workspaceStore.setLoading(true)
    workspaceStore.setError(null)

    // 提前设置 currentPath，让依赖工作区路径的视图尽早切换。
    workspaceStore.setCurrentPath(path, false)
    workspaceStore.setStatusList(snapshot?.statusList || [])
    workspaceStore.setSvnInfo(snapshot?.svnInfo || null)
    workspaceStore.setStatusIsStale(true)

    const statusRequest = svnStatus(path)
    // Convert the eager metadata request into a fulfilled result so a status
    // failure cannot leave a second rejected promise unobserved.
    const infoRequest = requestWorkspaceInfo(path, isCurrent)
    loadFilterRules(workspaceStore, isCurrent)

    try {
      // Keep raw status private until filtering has completed.
      const status = await statusRequest
      if (!isCurrent()) return false

      const infoResult = await infoRequest
      if (!infoResult.ok) throw infoResult.error
      const info = infoResult.info
      if (!isCurrent() || !info) return false
      const filteredStatus = await filterByGitignoreAsync(status, workspaceStore.gitignorePatterns)
      if (!isCurrent()) return false
      workspaceStore.setStatusList(filteredStatus)
      workspaceStore.setSvnInfo(info)
      workspaceStore.setStatusIsStale(false)
      cacheWorkspaceSnapshot(path, filteredStatus, info, useSettings().settings.gitignoreEnabled, useSettings().settings.filterRules ?? '.gitignore')
      workspaceStore.rememberWorkspace(path)
      return true
    } catch (err) {
      if (!isCurrent()) return false

      if (snapshot) {
        workspaceStore.setStatusList(snapshot.statusList)
        workspaceStore.setSvnInfo(snapshot.svnInfo)
        workspaceStore.setStatusIsStale(true)
        workspaceStore.setError(String(err))
        return false
      }
      if (previousPath) workspaceStore.setCurrentPath(previousPath, false)
      else workspaceStore.clearWorkspace()
      workspaceStore.setStatusList(previousStatusList)
      workspaceStore.setSvnInfo(previousSvnInfo)
      workspaceStore.setStatusIsStale(previousStatusIsStale)
      workspaceStore.setError(String(err))
      return false
    } finally {
      if (isCurrentGeneration()) workspaceStore.setLoading(false)
    }
  }

  async function openWorkspace(selectDialogTitle: string): Promise<boolean> {
    const selected = await open({
      directory: true,
      multiple: false,
      title: selectDialogTitle,
    })

    if (!selected) return false

    const path = Array.isArray(selected) ? selected[0] : selected
    return loadWorkspace(path)
  }

  async function restoreLastWorkspace(): Promise<boolean> {
    const path = workspaceStore.getLastWorkspacePath()
    if (!path) return false
    return loadWorkspace(path)
  }

  async function performRefreshStatus(force = false): Promise<boolean> {
    if (!workspaceStore.currentPath) return false

    const generation = ++workspaceRequestGeneration
    const path = workspaceStore.currentPath
    const isCurrent = () => (
      generation === workspaceRequestGeneration && workspaceStore.currentPath === path
    )

    workspaceStore.setLoading(true)
    workspaceStore.setStatusIsStale(true)
    workspaceStore.setError(null)
    try {
      const statusRequest = svnStatus(path, force)
      const infoRequest = requestWorkspaceInfo(path, isCurrent)
      loadFilterRules(workspaceStore, isCurrent)
      const status = await statusRequest
      if (!isCurrent()) return false
      const infoResult = await infoRequest
      if (!infoResult.ok) throw infoResult.error
      const info = infoResult.info
      if (!isCurrent() || !info) return false
      const filteredStatus = await filterByGitignoreAsync(status, workspaceStore.gitignorePatterns)
      if (!isCurrent()) return false
      workspaceStore.setStatusList(filteredStatus)
      workspaceStore.setSvnInfo(info)
      workspaceStore.setStatusIsStale(false)
      cacheWorkspaceSnapshot(path, filteredStatus, info, useSettings().settings.gitignoreEnabled, useSettings().settings.filterRules ?? '.gitignore')
      return true
    } catch (err) {
      if (!isCurrent()) return false
      workspaceStore.setError(String(err))
      return false
    } finally {
      if (isCurrent()) workspaceStore.setLoading(false)
    }
  }

  function loadWorkspace(path: string): Promise<boolean> {
    if (pendingRequest?.path === path && pendingRequest.generation === workspaceRequestGeneration) return pendingRequest.promise
    return trackRequest(path, () => performLoadWorkspace(path))
  }

  function refreshStatus(): Promise<boolean> {
    const path = workspaceStore.currentPath
    if (!path) return Promise.resolve(false)
    if (pendingRequest?.path === path && pendingRequest.force && pendingRequest.generation === workspaceRequestGeneration) return pendingRequest.promise
    return trackRequest(path, () => performRefreshStatus(true), true)
  }

  // A mutation or setting change requires a scan started after that change;
  // an older background scan must not satisfy this request.
  function refreshStatusAfterMutation(): Promise<boolean> {
    const path = workspaceStore.currentPath
    if (path) {
      invalidateWorkspaceSnapshot(path)
      workspaceStore.setStatusIsStale(true)
    }
    return path ? trackRequest(path, () => performRefreshStatus(true), true) : Promise.resolve(false)
  }

  function refreshStatusIfStale(maxAgeMs: number): Promise<boolean> {
    const path = workspaceStore.currentPath
    if (!path) return Promise.resolve(false)
    if (pendingRequest?.path === path && pendingRequest.generation === workspaceRequestGeneration) return pendingRequest.promise
    if (lastRefresh?.path === path && lastRefresh.generation === workspaceRequestGeneration
      && Date.now() - lastRefresh.timestamp < maxAgeMs) return Promise.resolve(true)
    return trackRequest(path, () => performRefreshStatus(false))
  }

  return { loadWorkspace, openWorkspace, restoreLastWorkspace, refreshStatus, refreshStatusAfterMutation, refreshStatusIfStale }
}
