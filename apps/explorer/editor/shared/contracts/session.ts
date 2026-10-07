export interface StudioConfig {
  network: string
  rpcUrl: string
  websocketUrl: string
  explorerUrl: string
  authRequired: boolean
}

export interface SessionStatus {
  authenticated: boolean
}

export interface LoginRequest {
  accessToken: string
}

export interface EditorSession {
  id: string
  token: string
  uid: number
  gid: number
  createdAt: number
  expiresAt: number
}
