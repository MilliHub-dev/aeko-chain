export type FileEntryType = 'file' | 'directory'

export interface FileEntry {
  path: string
  name: string
  type: FileEntryType
  depth: number
}

export interface FileTree {
  files: FileEntry[]
}

export interface FileContents {
  path: string
  content: string
}

export interface FileWriteResult {
  path: string
  byteLength: number
}

export interface DirectoryCreateResult {
  path: string
}

export interface RenamePathResult {
  from: string
  to: string
  type: FileEntryType
}

export interface DeletePathResult {
  path: string
  type: FileEntryType
}

export interface DeleteWorkspaceResult {
  deleted: true
}
