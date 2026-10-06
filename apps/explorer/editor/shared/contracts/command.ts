import type { WorkspaceId } from './workspace.js'

export type StudioCommand = 'build' | 'check' | 'lint' | 'typecheck' | 'format' | 'test' | 'run' | 'clean'

export interface ConsoleAttachRequest { workspaceId: WorkspaceId }
export interface ConsoleRunRequest { workspaceId: WorkspaceId; command: StudioCommand }
export interface ConsoleCancelRequest { workspaceId: WorkspaceId }

export interface ConsoleReadyEvent {
  history: string
  running: StudioCommand | null
  available: StudioCommand[]
}

export interface ConsoleOutputEvent {
  workspaceId: WorkspaceId
  data: string
  stream: 'stdout' | 'stderr' | 'system'
}

export interface ConsoleStateEvent {
  workspaceId: WorkspaceId
  command: StudioCommand
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  exitCode?: number
}
