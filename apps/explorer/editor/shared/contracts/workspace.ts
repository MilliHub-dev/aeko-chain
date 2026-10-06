export type WorkspaceId = string

export type ProjectTemplate = 'rust-program' | 'typescript-client' | 'python-client'

export interface Workspace {
  id: WorkspaceId
  name: string
  template: ProjectTemplate
  templateLabel: string
  defaultNewFile: string
  createdAt: string
  updatedAt: string
}

export type WorkspaceMetadata = Omit<Workspace, 'id'>

export interface CreateWorkspaceRequest {
  name: string
  template: ProjectTemplate
}

export interface WorkspaceList {
  workspaces: Workspace[]
}
