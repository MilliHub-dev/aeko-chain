import type { EditorSession } from './session.js'
import type {
  ConsoleAttachRequest,
  ConsoleCancelRequest,
  ConsoleOutputEvent,
  ConsoleReadyEvent,
  ConsoleRunRequest,
  ConsoleStateEvent,
} from './command.js'
import type { TerminalInputRequest, TerminalReadyEvent, TerminalResizeRequest, TerminalStartRequest } from './terminal.js'

export interface ClientToServerEvents {
  'console:attach': (request: ConsoleAttachRequest) => void
  'console:run': (request: ConsoleRunRequest) => void
  'console:cancel': (request: ConsoleCancelRequest) => void
  'terminal:start': (request: TerminalStartRequest) => void
  'terminal:input': (request: TerminalInputRequest) => void
  'terminal:resize': (request: TerminalResizeRequest) => void
}

export interface ServerToClientEvents {
  'console:ready': (event: ConsoleReadyEvent) => void
  'console:output': (event: ConsoleOutputEvent) => void
  'console:state': (event: ConsoleStateEvent) => void
  'console:error': (message: string) => void
  'terminal:ready': (event: TerminalReadyEvent) => void
  'terminal:data': (data: string) => void
  'terminal:error': (message: string) => void
}

export type InterServerEvents = Record<string, (...args: never[]) => void>
export interface SocketData { editorSession: EditorSession }
