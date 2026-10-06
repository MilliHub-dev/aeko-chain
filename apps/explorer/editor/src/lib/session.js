const KEY = 'aeko.contract-studio.ui.v2'

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function write(value) {
  localStorage.setItem(KEY, JSON.stringify(value))
}

export function loadWorkspaceUi(workspaceId) {
  return read().workspaces?.[workspaceId] || {}
}

export function saveWorkspaceUi(workspaceId, next) {
  const current = read()
  write({
    ...current,
    workspaces: {
      ...(current.workspaces || {}),
      [workspaceId]: {
        ...(current.workspaces?.[workspaceId] || {}),
        ...next,
      },
    },
  })
}
