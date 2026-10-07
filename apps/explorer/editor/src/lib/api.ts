import type { ApiFailure, ApiSuccess } from '../../shared/contracts/api.js'
import type {
  DeletePathResult,
  DeleteWorkspaceResult,
  DirectoryCreateResult,
  FileContents,
  FileTree,
  FileWriteResult,
  RenamePathResult,
} from '../../shared/contracts/filesystem.js'
import type { PreviewStatus } from '../../shared/contracts/preview.js'
import type { LoginRequest, SessionStatus, StudioConfig } from '../../shared/contracts/session.js'
import type { CreateWorkspaceRequest, Workspace, WorkspaceList } from '../../shared/contracts/workspace.js'
import { EditorRequestError } from '../../shared/errors/editor-errors.js'

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

function isApiFailure(value: unknown): value is ApiFailure {
  if (!value || typeof value !== 'object' || !('error' in value)) return false
  const error = (value as { error?: unknown }).error
  return Boolean(
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof error.message === 'string',
  )
}

function apiErrorCode(value: ApiFailure): string | undefined {
  return typeof value.error.code === 'string' ? value.error.code : undefined
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...requestOptions } = options
  const init: RequestInit = {
    credentials: 'same-origin',
    ...requestOptions,
  }
  if (body !== undefined) {
    const headers = new Headers(requestOptions.headers)
    headers.set('content-type', 'application/json')
    init.headers = headers
    init.body = JSON.stringify(body)
  }

  const response = await fetch(path, init)
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isApiFailure(payload)
      ? payload.error.message
      : `Request failed with HTTP ${response.status}.`
    throw new EditorRequestError(
      message,
      response.status,
      isApiFailure(payload) ? apiErrorCode(payload) : undefined,
    )
  }
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new EditorRequestError('Contract Studio returned an invalid response.', 502, 'INVALID_RESPONSE')
  }
  return (payload as ApiSuccess<T>).data
}

export const api = {
  config: (): Promise<StudioConfig> => request('/api/config'),
  session: (): Promise<SessionStatus> => request('/api/session'),
  login: (accessToken: string): Promise<SessionStatus> => request('/api/session', {
    method: 'POST',
    body: { accessToken } satisfies LoginRequest,
  }),
  logout: (): Promise<SessionStatus> => request('/api/session', { method: 'DELETE' }),
  listWorkspaces: (): Promise<WorkspaceList> => request('/api/workspaces'),
  createWorkspace: (input: CreateWorkspaceRequest): Promise<Workspace> => request('/api/workspaces', {
    method: 'POST',
    body: input,
  }),
  deleteWorkspace: (workspaceId: string): Promise<DeleteWorkspaceResult> => request(`/api/workspaces/${workspaceId}`, {
    method: 'DELETE',
  }),
  tree: (workspaceId: string): Promise<FileTree> => request(`/api/workspaces/${workspaceId}/tree`),
  readFile: (workspaceId: string, path: string): Promise<FileContents> => request(
    `/api/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`,
  ),
  writeFile: (workspaceId: string, path: string, content: string): Promise<FileWriteResult> => request(
    `/api/workspaces/${workspaceId}/file`,
    { method: 'PUT', body: { path, content } },
  ),
  createFile: (workspaceId: string, path: string, content = ''): Promise<FileWriteResult> => request(
    `/api/workspaces/${workspaceId}/file`,
    { method: 'POST', body: { path, content } },
  ),
  createDirectory: (workspaceId: string, path: string): Promise<DirectoryCreateResult> => request(
    `/api/workspaces/${workspaceId}/directory`,
    { method: 'POST', body: { path } },
  ),
  renamePath: (workspaceId: string, from: string, to: string): Promise<RenamePathResult> => request(
    `/api/workspaces/${workspaceId}/rename`,
    { method: 'POST', body: { from, to } },
  ),
  deletePath: (workspaceId: string, path: string): Promise<DeletePathResult> => request(
    `/api/workspaces/${workspaceId}/path?path=${encodeURIComponent(path)}`,
    { method: 'DELETE' },
  ),
  previewStatus: (workspaceId: string): Promise<PreviewStatus> => request(
    `/api/workspaces/${workspaceId}/preview`,
  ),
}
