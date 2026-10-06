import type { Request } from 'express'
import type { EditorSession } from '../shared/contracts/session.js'

export interface EditorServerConfig {
  production: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  logFormat: 'json' | 'text'
  port: number
  publicOrigin: string
  accessToken: string
  network: string
  rpcUrl: string
  explorerUrl: string
  workspaceRoot: string
  sandboxUidStart: number
  maxSessions: number
  sessionTtlMs: number
  workspaceTtlMs: number
  maxWorkspacesPerSession: number
  maxFilesPerWorkspace: number
  maxFileBytes: number
  maxWorkspaceBytes: number
  terminalHistoryBytes: number
  allowInsecureLocal: boolean
}

interface EditorRequestState {
  editorSession?: EditorSession
  editorRequestId?: string
}

function requestState(request: Request): Request & EditorRequestState {
  return request as Request & EditorRequestState
}

export function setEditorSession(request: Request, session: EditorSession): void {
  requestState(request).editorSession = session
}

export function requireEditorSession(request: Request): EditorSession {
  const session = requestState(request).editorSession
  if (!session) throw new Error('Authenticated editor session is missing.')
  return session
}

export function setEditorRequestId(request: Request, requestId: string): void {
  requestState(request).editorRequestId = requestId
}

export function editorRequestId(request: Request): string | undefined {
  return requestState(request).editorRequestId
}
