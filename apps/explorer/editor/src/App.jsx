import { useCallback, useEffect, useState } from 'react'
import LoginGate from './components/LoginGate'
import WorkspaceLauncher from './components/WorkspaceLauncher'
import Workspace from './ide/Workspace'
import { api } from './lib/api'

export default function App() {
  const [config, setConfig] = useState(null)
  const [authenticated, setAuthenticated] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadWorkspaces = useCallback(async () => {
    const data = await api.listWorkspaces()
    setWorkspaces(data.workspaces)
    return data.workspaces
  }, [])

  const verify = useCallback(async () => {
    try {
      const [nextConfig, session] = await Promise.all([api.config(), api.session()])
      setConfig(nextConfig)
      setAuthenticated(session.authenticated)
      if (session.authenticated) await loadWorkspaces()
    } catch (cause) {
      setError(cause.message)
      setAuthenticated(false)
    }
  }, [loadWorkspaces])

  useEffect(() => {
    verify()
  }, [verify])

  const createWorkspace = async (input) => {
    setBusy(true)
    setError('')
    try {
      const workspace = await api.createWorkspace(input)
      setWorkspaces((current) => [workspace, ...current])
      setWorkspaceId(workspace.id)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const deleteWorkspace = async (workspace) => {
    if (!window.confirm(`Delete ${workspace.name} and all files in its isolated workspace?`)) return
    setBusy(true)
    setError('')
    try {
      await api.deleteWorkspace(workspace.id)
      await loadWorkspaces()
      if (workspaceId === workspace.id) setWorkspaceId('')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    await api.logout().catch(() => {})
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
