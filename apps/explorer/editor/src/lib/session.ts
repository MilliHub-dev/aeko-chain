export type PanelTab = 'TERMINAL' | 'OUTPUT' | 'PROBLEMS'

export interface WorkspaceUiState {
  panelTab?: PanelTab
  panelCollapsed?: boolean
  panelPercent?: number
}

interface StoredUi {
  workspaces?: Record<string, WorkspaceUiState>
}

const KEY = 'aeko.contract-studio.ui'

function read(): StoredUi {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed as StoredUi : {}
  } catch {
    return {}
  }
}

function write(value: StoredUi): void {
  localStorage.setItem(KEY, JSON.stringify(value))
}

export function loadWorkspaceUi(workspaceId: string): WorkspaceUiState {
  return read().workspaces?.[workspaceId] || {}
}

export function saveWorkspaceUi(workspaceId: string, next: WorkspaceUiState): void {
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
