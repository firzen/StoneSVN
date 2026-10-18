import { invoke } from '@tauri-apps/api/core'
import { invokeWithConnectionPrompt } from './connection'
import type { CommandResult, SvnStatus, SvnLogEntry, SvnInfo, SvnAuthUser, DiffResult, FilePreviewResult, BlameLine, StashUnversionedEntry } from '@/types'

export async function configureSvnExecutable(executable?: string): Promise<string> {
  return invoke<string>('configure_svn_executable', {
    executable: executable?.trim() || null,
  })
}

export async function configureSvnServerSecurity(server: string, legacyTls: boolean, trustInvalidCertificates: boolean): Promise<string> {
  return invoke<string>('configure_svn_server_security', { server, legacyTls, trustInvalidCertificates })
}

async function checkConnection(target: string): Promise<void> {
  await invokeWithConnectionPrompt('svn_connection_info', { target })
}

export async function svnCheckout(
  url: string,
  path: string,
  revision?: number
): Promise<CommandResult> {
  await checkConnection(url)
  return invoke<CommandResult>('svn_checkout', { url, path, revision })
}

export async function svnUpdate(path: string, revision?: number): Promise<CommandResult> {
  return invokeWithConnectionPrompt<CommandResult>('svn_update', { path, revision })
}

export async function svnCommit(
  path: string,
  message: string,
  files?: string[],
  filterRules?: string[],
): Promise<CommandResult> {
  await checkConnection(path)
  return invoke<CommandResult>('svn_commit', { path, message, files, filterRules })
}

export async function svnStatus(path: string, force = false): Promise<SvnStatus[]> {
  return invoke<SvnStatus[]>('svn_status', { path, force })
}

export async function svnLog(
  path: string,
  limit?: number,
  startRev?: number,
  endRev?: number,
  keyword?: string,
  author?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<SvnLogEntry[]> {
  return invokeWithConnectionPrompt<SvnLogEntry[]>('svn_log', { path, limit, startRev, endRev, keyword, author, dateFrom, dateTo })
}

export async function svnFileLog(path: string, file: string, limit: number, startRev?: number): Promise<SvnLogEntry[]> {
  return invokeWithConnectionPrompt<SvnLogEntry[]>('svn_log', { path, file, limit, startRev })
}

export async function svnCurrentUser(path: string): Promise<SvnAuthUser | null> {
  return invoke<SvnAuthUser | null>('svn_current_user', { path })
}

export async function svnInfo(path: string): Promise<SvnInfo> {
  return invoke<SvnInfo>('svn_info', { path })
}

export async function svnLocalRevision(path: string): Promise<number> {
  return invoke<number>('svn_local_revision', { path })
}

export async function svnRemoteInfo(path: string): Promise<SvnInfo> {
  return invokeWithConnectionPrompt<SvnInfo>('svn_remote_info', { path })
}

export async function svnDiff(
  workspacePath: string,
  file: string,
  oldRev?: number,
  newRev?: number
): Promise<DiffResult> {
  return invokeWithConnectionPrompt<DiffResult>('svn_diff', { workspacePath, file, oldRev, newRev })
}

export async function svnApplyPatch(
  workspacePath: string,
  patch: string,
  reverse = false
): Promise<CommandResult> {
  return invoke<CommandResult>('svn_apply_patch', { workspacePath, patch, reverse })
}

export async function svnFilePreview(
  workspacePath: string,
  file: string,
  oldRev?: number,
  newRev?: number,
): Promise<FilePreviewResult> {
  return invokeWithConnectionPrompt<FilePreviewResult>('svn_file_preview', { workspacePath, file, oldRev, newRev })
}

export async function openWorkspaceFile(path: string, file: string): Promise<void> {
  return invoke<void>('open_workspace_file', { path, file })
}

export async function svnBlame(workspacePath: string, file: string): Promise<BlameLine[]> {
  return invokeWithConnectionPrompt<BlameLine[]>('svn_blame', { workspacePath, file })
}

export async function svnExport(path: string, file: string, destination: string): Promise<CommandResult> {
  return invokeWithConnectionPrompt<CommandResult>('svn_export', { path, file, destination })
}

export async function svnAdd(path: string, files: string[], filterRules?: string[]): Promise<CommandResult> {
  return invoke<CommandResult>('svn_add', { path, files, filterRules })
}

export async function svnCancelAdd(path: string, file: string): Promise<CommandResult> {
  return invoke<CommandResult>('svn_cancel_add', { path, file })
}

export async function svnDelete(path: string, files: string[]): Promise<CommandResult> {
  return invoke<CommandResult>('svn_delete', { path, files })
}

export async function svnRestoreFileRevision(path: string, file: string, revision: number): Promise<CommandResult> {
  return invokeWithConnectionPrompt<CommandResult>('svn_restore_file_revision', { path, file, revision })
}

export async function svnRevertPreview(path: string, file: string): Promise<SvnStatus[]> {
  return invoke<SvnStatus[]>('svn_revert_preview', { path, file })
}

export async function svnRevert(path: string, files: string[], preview?: SvnStatus[]): Promise<CommandResult> {
  return invoke<CommandResult>('svn_revert', { path, files, preview })
}

export async function deleteUnversioned(path: string, files: string[]): Promise<CommandResult> {
  return invoke<CommandResult>('delete_unversioned', { path, files })
}

export async function readUnversionedFiles(path: string, files: string[]): Promise<StashUnversionedEntry[]> {
  return invoke<StashUnversionedEntry[]>('read_unversioned_files', { path, files })
}

export async function restoreUnversionedFiles(
  path: string,
  files: StashUnversionedEntry[],
  dryRun = false
): Promise<void> {
  return invoke<void>('restore_unversioned_files', { path, files, dryRun })
}

export async function svnResolve(
  path: string,
  files: string[],
  strategy: string
): Promise<CommandResult> {
  return invoke<CommandResult>('svn_resolve', { path, files, strategy })
}

export async function svnMove(path: string, source: string, destination: string): Promise<CommandResult> {
  return invoke<CommandResult>('svn_move', { path, source, destination })
}

export async function svnRelocate(path: string, url: string): Promise<CommandResult> {
  await checkConnection(url)
  return invoke<CommandResult>('svn_relocate', { path, url })
}

export async function svnCleanup(path: string): Promise<CommandResult> {
  return invoke<CommandResult>('svn_cleanup', { path })
}

export async function svnSwitch(path: string, url: string): Promise<CommandResult> {
  await checkConnection(url.includes('://') ? url : path)
  return invoke<CommandResult>('svn_switch', { path, url })
}

export async function svnMerge(
  path: string,
  source: string,
  revStart: number,
  revEnd: number
): Promise<CommandResult> {
  await checkConnection(source.includes('://') ? source : path)
  return invoke<CommandResult>('svn_merge', { path, source, revStart, revEnd })
}

export type OpenWorkspaceTarget = 'explorer' | 'vscode' | 'terminal'

export async function openWorkspaceTarget(
  path: string,
  target: OpenWorkspaceTarget
): Promise<void> {
  return invoke<void>('open_workspace_target', { path, target })
}

export async function revealWorkspaceFile(path: string, file: string): Promise<void> {
  return invoke<void>('reveal_workspace_file', { path, file })
}

export async function launchWorkspacePath(): Promise<string | null> {
  return invoke<string | null>('launch_workspace_path')
}

export async function svnPropertyDetails(path: string, file: string): Promise<import('@/types').PropertyDetails> {
  return invoke('svn_property_details', { path, file })
}

export async function svnSetProperty(path: string, file: string, name: string, value: string | null): Promise<void> {
  return invoke('svn_set_property', { path, file, name, value })
}

export async function workspaceChildren(path: string, directory: string): Promise<import('@/types').WorkspaceChild[]> {
  return invoke('workspace_children', { path, directory })
}

export async function workspaceSearch(path: string, query: string): Promise<import('@/types').WorkspaceChild[]> {
  return invoke('workspace_search', { path, query })
}
