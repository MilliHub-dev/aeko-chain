import type { EditorSession } from './session.js'
import type {
  TerminalInputRequest,
  TerminalReadyEvent,
  TerminalResizeRequest,
  TerminalStartRequest,
} from './terminal.js'

export interface ClientToServerEvents {
  'terminal:start': (request: TerminalStartRequest) => void
  'terminal:input': (request: TerminalInputRequest) => void
  'terminal:resize': (request: TerminalResizeRequest) => void
}

export interface ServerToClientEvents {
  'terminal:ready': (event: TerminalReadyEvent) => void
  'terminal:data': (data: string) => void
  'terminal:error': (message: string) => void
}

export type InterServerEvents = Record<string, (...args: never[]) => void>

export interface SocketData {
  editorSession: EditorSession
}
