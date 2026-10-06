import type { WorkspaceId } from './workspace.js'

export interface TerminalStartRequest {
  workspaceId: WorkspaceId
  cols?: number
  rows?: number
}

export interface TerminalInputRequest {
  workspaceId: WorkspaceId
  data: string
}

export interface TerminalResizeRequest {
  workspaceId: WorkspaceId
  cols: number
  rows: number
}

export interface TerminalReadyEvent {
  history: string
}
