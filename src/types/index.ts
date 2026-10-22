export interface UpdatedFile {
  directory?: boolean
  path: string
  action: string
  old_revision: number
  new_revision: number
  target: string
}

export interface UpdateResult extends CommandResult {
  files: UpdatedFile[]
  warning: string | null
}

export interface CommandResult {
  success: boolean
  output: string
  error: string | null
}

export interface SvnStatus {
  path: string
  directory?: boolean
  status: string
  status_code: string
  prop_status: string
  locked: boolean
  history: boolean
  switched: boolean
}

export interface SvnLogEntry {
  revision: number
  author: string
  date: string
  message: string
  changed_paths: SvnLogPath[]
}

export interface SvnLogPath {
  path: string
  action: string
}

export interface SvnInfo {
  path: string
  url: string
  repository_root: string
  revision: number
  node_kind: string
  schedule: string
}

export interface SvnAuthUser {
  username: string
  realm: string
}

export interface DiffResult {
  path: string
  diff: string
  old_revision: number
  new_revision: number
}

export interface FilePreviewResult extends DiffResult {
  preview_kind: 'text' | 'image' | 'binary' | 'directory'
  image_data: string | null
  can_open: boolean
}

export interface BlameLine {
  revision: number
  author: string
  line: string
}

export interface StashHunk {
  id: string
  header: string
  lines: string[]
  added: number
  removed: number
}

export interface StashFile {
  path: string
  header: string[]
  hunks: StashHunk[]
}

export interface StashEntry {
  id: string
  name: string
  workspacePath: string
  createdAt: string
  patch: string
  files: string[]
  hunkCount: number
  unversionedFiles?: StashUnversionedEntry[]
}

export interface StashUnversionedEntry {
  path: string
  kind: 'file' | 'directory'
  contentBase64?: string
}

export interface SvnProperty {
  name: string
  value: string
  binary: boolean
}

export interface PropertyDetails {
  link_target: string | null
  info: SvnInfo | null
  directory: boolean
  size: number | null
  modified: string | null
  editable: boolean
  properties: SvnProperty[]
}

export interface WorkspaceChild {
  path: string
  name: string
  directory: boolean
  expandable?: boolean
}
