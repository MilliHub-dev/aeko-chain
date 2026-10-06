async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Request failed with HTTP ${response.status}.`)
    error.code = payload?.error?.code
    error.status = response.status
    throw error
  }
  return payload?.data
}

export const api = {
  config: () => request('/api/config'),
  session: () => request('/api/session'),
  login: (accessToken) => request('/api/session', { method: 'POST', body: { accessToken } }),
  logout: () => request('/api/session', { method: 'DELETE' }),
  listWorkspaces: () => request('/api/workspaces'),
  createWorkspace: (input) => request('/api/workspaces', { method: 'POST', body: input }),
  deleteWorkspace: (workspaceId) => request(`/api/workspaces/${workspaceId}`, { method: 'DELETE' }),
  tree: (workspaceId) => request(`/api/workspaces/${workspaceId}/tree`),
  readFile: (workspaceId, path) => request(`/api/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`),
  writeFile: (workspaceId, path, content) => request(`/api/workspaces/${workspaceId}/file`, {
    method: 'PUT',
    body: { path, content },
  }),
  createFile: (workspaceId, path, content = '') => request(`/api/workspaces/${workspaceId}/file`, {
    method: 'POST',
    body: { path, content },
  }),
  createDirectory: (workspaceId, path) => request(`/api/workspaces/${workspaceId}/directory`, {
    method: 'POST',
    body: { path },
  }),
  renamePath: (workspaceId, from, to) => request(`/api/workspaces/${workspaceId}/rename`, {
    method: 'POST',
    body: { from, to },
  }),
  deletePath: (workspaceId, path) => request(`/api/workspaces/${workspaceId}/path?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  }),
}
