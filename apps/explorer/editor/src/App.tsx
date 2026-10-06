import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../shared/contracts/session.js'
import type { CreateWorkspaceRequest, Workspace as WorkspaceContract } from '../shared/contracts/workspace.js'
import { errorMessage } from '../shared/errors/editor-errors.js'
import LoginGate from './components/LoginGate'
import WorkspaceLauncher from './components/WorkspaceLauncher'
import Workspace from './ide/Workspace'
import { api } from './lib/api'

export default function App() {
  const [config, setConfig] = useState<StudioConfig | null>(null)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceContract[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadWorkspaces = useCallback(async (): Promise<WorkspaceContract[]> => {
    const data = await api.listWorkspaces()
    setWorkspaces(data.workspaces)
    return data.workspaces
  }, [])

  const verify = useCallback(async (): Promise<void> => {
    try {
      const [nextConfig, session] = await Promise.all([api.config(), api.session()])
      setConfig(nextConfig)
      setAuthenticated(session.authenticated)
      if (session.authenticated) await loadWorkspaces()
    } catch (cause) {
      setError(errorMessage(cause, 'Contract Studio could not start.'))
      setAuthenticated(false)
    }
  }, [loadWorkspaces])

  useEffect(() => {
    void verify()
  }, [verify])

  const createWorkspace = async (input: CreateWorkspaceRequest): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const workspace = await api.createWorkspace(input)
      setWorkspaces((current) => [workspace, ...current])
      setWorkspaceId(workspace.id)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const deleteWorkspace = async (workspace: WorkspaceContract): Promise<void> => {
    if (!window.confirm(`Delete ${workspace.name} and all files in its isolated workspace?`)) return
    setBusy(true)
    setError('')
    try {
      await api.deleteWorkspace(workspace.id)
      await loadWorkspaces()
      if (workspaceId === workspace.id) setWorkspaceId('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const logout = async (): Promise<void> => {
    await api.logout().catch(() => undefined)
    setAuthenticated(false)
    setWorkspaces([])
    setWorkspaceId('')
  }

  if (authenticated === null) {
    return <div className="boot-screen"><span className="spinner" /> Starting AEKO Contract Studio…</div>
  }

  if (!authenticated) {
    return <LoginGate config={config} onAuthenticated={verify} />
  }

  if (!config) {
    return <div className="boot-screen"><span className="spinner" /> Loading Contract Studio configuration…</div>
  }

  const workspace = workspaces.find((item) => item.id === workspaceId)
  if (!workspace) {
    return (
      <>
        <WorkspaceLauncher
          workspaces={workspaces}
          onOpen={setWorkspaceId}
          onCreate={createWorkspace}
          onDelete={deleteWorkspace}
          busy={busy}
        />
        {error ? <div className="global-error" role="alert">{error}</div> : null}
      </>
    )
  }

  return (
    <Workspace
      workspace={workspace}
      config={config}
      onHome={() => setWorkspaceId('')}
      onLogout={logout}
    />
  )
}
