import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { loadWorkspaceUi, saveWorkspaceUi } from '../lib/session'
import MonacoEditor from './MonacoEditor'
import SplitPane, { Pane } from './SplitPane'
import ActivityBar from '../components/ActivityBar'
import BottomPanel from '../components/BottomPanel'
import EditorTabs from '../components/EditorTabs'
import ExplorerPane from '../components/ExplorerPane'
import StatusBar from '../components/StatusBar'

const DEFAULT_PANEL_PERCENT = 28
const MAX_PANEL_PERCENT = 72

function remapPath(path, from, to) {
  if (path === from) return to
  return path.startsWith(from + '/') ? to + path.slice(from.length) : path
}

export default function Workspace({ workspace, config, onHome, onLogout }) {
  const savedUi = useMemo(() => loadWorkspaceUi(workspace.id), [workspace.id])
  const [entries, setEntries] = useState([])
  const [openFiles, setOpenFiles] = useState([])
  const [activePath, setActivePath] = useState('')
  const [buffers, setBuffers] = useState(new Map())
  const [dirtyPaths, setDirtyPaths] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [panelTab, setPanelTab] = useState(savedUi.panelTab || 'TERMINAL')
  const [panelCollapsed, setPanelCollapsed] = useState(Boolean(savedUi.panelCollapsed))
  const [panelMaximized, setPanelMaximized] = useState(false)
  const [panelPercent, setPanelPercent] = useState(savedUi.panelPercent || DEFAULT_PANEL_PERCENT)
  const saveTimers = useRef(new Map())

  const refreshTree = useCallback(async () => {
    const next = await api.tree(workspace.id)
    setEntries(next.files)
  }, [workspace.id])

  const report = useCallback((cause) => {
    setError(cause instanceof Error ? cause.message : String(cause || 'Workspace operation failed.'))
  }, [])

  useEffect(() => {
    refreshTree().catch(report)
    return () => {
      for (const timer of saveTimers.current.values()) window.clearTimeout(timer)
      saveTimers.current.clear()
    }
  }, [refreshTree, report])

  const openFile = useCallback(async (path) => {
    try {
      let content = buffers.get(path)
      if (content === undefined) {
        const result = await api.readFile(workspace.id, path)
        content = result.content
        setBuffers((current) => new Map(current).set(path, content))
      }
      setOpenFiles((current) => current.includes(path) ? current : [...current, path])
      setActivePath(path)
      setError('')
    } catch (cause) {
      report(cause)
    }
  }, [buffers, report, workspace.id])

  useEffect(() => {
    const firstFile = entries.find((entry) => entry.type === 'file')
    if (!activePath && firstFile) openFile(firstFile.path)
  }, [activePath, entries, openFile])

  const saveFile = useCallback(async (path, content) => {
    if (!path) return
    setSaving(true)
    try {
      await api.writeFile(workspace.id, path, content)
      setDirtyPaths((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
      await refreshTree()
      setError('')
    } catch (cause) {
      report(cause)
      throw cause
    } finally {
      setSaving(false)
    }
  }, [refreshTree, report, workspace.id])

  const flushDirty = useCallback(async () => {
    const paths = [...dirtyPaths]
    for (const path of paths) {
      const timer = saveTimers.current.get(path)
      if (timer) {
        window.clearTimeout(timer)
        saveTimers.current.delete(path)
      }
      await saveFile(path, buffers.get(path) ?? '')
    }
  }, [buffers, dirtyPaths, saveFile])

  const changeFile = (content) => {
    if (!activePath) return
    setBuffers((current) => new Map(current).set(activePath, content))
    setDirtyPaths((current) => new Set(current).add(activePath))

    const existing = saveTimers.current.get(activePath)
    if (existing) window.clearTimeout(existing)
    saveTimers.current.set(activePath, window.setTimeout(() => {
      saveTimers.current.delete(activePath)
      saveFile(activePath, content).catch(() => {})
    }, 900))
  }

  const closeFile = async (path) => {
    try {
      if (dirtyPaths.has(path)) await saveFile(path, buffers.get(path) ?? '')
      setOpenFiles((current) => {
        const next = current.filter((item) => item !== path)
        if (path === activePath) setActivePath(next.at(-1) || '')
        return next
      })
    } catch {
      // saveFile already surfaced the error and the tab remains open.
    }
  }

  const newFile = async () => {
    const path = window.prompt('Relative file path', workspace.defaultNewFile || 'src/new_file.rs')
    if (!path) return
    try {
      await api.createFile(workspace.id, path, '')
      await refreshTree()
      await openFile(path)
    } catch (cause) {
      report(cause)
    }
  }

  const newDirectory = async () => {
    const path = window.prompt('Relative folder path', 'src/module')
    if (!path) return
    try {
      await api.createDirectory(workspace.id, path)
      await refreshTree()
      setError('')
    } catch (cause) {
      report(cause)
    }
  }

  const renameEntry = async (entry) => {
    const to = window.prompt('Rename path', entry.path)
    if (!to || to === entry.path) return

    try {
      const result = await api.renamePath(workspace.id, entry.path, to)
      setBuffers((current) => {
        const next = new Map()
        for (const [path, content] of current) {
          next.set(remapPath(path, result.from, result.to), content)
        }
        return next
      })
      setOpenFiles((current) => current.map((path) => remapPath(path, result.from, result.to)))
      setDirtyPaths((current) => new Set([...current].map((path) => remapPath(path, result.from, result.to))))
      if (activePath) setActivePath((path) => remapPath(path, result.from, result.to))
      await refreshTree()
      setError('')
    } catch (cause) {
      report(cause)
    }
  }

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Delete ${entry.path}? This cannot be undone.`)) return
    try {
      await api.deletePath(workspace.id, entry.path)
      const affected = (path) => path === entry.path || path.startsWith(entry.path + '/')
      setOpenFiles((current) => current.filter((path) => !affected(path)))
      setBuffers((current) => {
        const next = new Map(current)
        for (const path of next.keys()) if (affected(path)) next.delete(path)
        return next
      })
      setDirtyPaths((current) => new Set([...current].filter((path) => !affected(path))))
      if (affected(activePath)) setActivePath('')
      await refreshTree()
      setError('')
    } catch (cause) {
      report(cause)
    }
  }

  const activeFile = activePath ? { path: activePath, content: buffers.get(activePath) ?? '' } : null

  const editorStack = (
    <div className="editor-stack">
      <EditorTabs
        paths={openFiles}
        activePath={activePath}
        dirtyPaths={dirtyPaths}
        onOpen={setActivePath}
        onClose={closeFile}
      />
      <div className="monaco-slot">
        <MonacoEditor
          key={`${workspace.id}:${activePath}`}
          workspaceId={workspace.id}
          file={activeFile}
          onChange={changeFile}
          onSave={(content) => saveFile(activePath, content)}
        />
      </div>
    </div>
  )

  const bottomPanel = (
    <BottomPanel
      workspaceId={workspace.id}
      activeTab={panelTab}
      onTabChange={(tab) => {
        setPanelTab(tab)
        saveWorkspaceUi(workspace.id, { panelTab: tab })
      }}
      collapsed={panelCollapsed}
      maximized={panelMaximized}
      onToggleCollapsed={() => {
        const next = !panelCollapsed
        setPanelCollapsed(next)
        setPanelMaximized(false)
        saveWorkspaceUi(workspace.id, { panelCollapsed: next })
      }}
      onToggleMaximized={() => {
        setPanelMaximized((value) => !value)
        setPanelCollapsed(false)
        saveWorkspaceUi(workspace.id, { panelCollapsed: false })
      }}
    />
  )

  const leaveWorkspace = async (target) => {
    try {
      await flushDirty()
      target()
    } catch {
      // Keep the workspace open when pending source could not be persisted.
    }
  }

  return (
    <div className="ide-root">
      <div className="title-bar">
        <div className="title-left">
          <span className="aeko-glyph">A</span>
          <span className="menu-word">File</span>
          <span className="menu-word">Edit</span>
          <span className="menu-word">Selection</span>
          <span className="menu-word">View</span>
          <span className="menu-word">Terminal</span>
          <span className="menu-word">Help</span>
        </div>
        <div className="title-command">
          <i className="codicon codicon-search" />
          <span>{workspace.name} — AEKO Contract Studio</span>
        </div>
        <div className="title-right">
          <span>{config.network}</span>
        </div>
      </div>

      <div className="workbench-row">
        <ActivityBar
          onHome={() => leaveWorkspace(onHome)}
          onLogout={() => leaveWorkspace(onLogout)}
        />
        <SplitPane className="primary-split" sizes={[18, 82]} minSize={[190, 420]} gutterSize={4}>
          <Pane className="sidebar-slot">
            <ExplorerPane
              workspace={workspace}
              entries={entries}
              activePath={activePath}
              onOpen={openFile}
              onNewFile={newFile}
              onNewDirectory={newDirectory}
              onRename={renameEntry}
              onDelete={deleteEntry}
              onRefresh={() => refreshTree().catch(report)}
            />
          </Pane>
          <Pane className="editor-slot">
            {panelCollapsed ? (
              <div className="editor-split-static">
                {editorStack}
                {bottomPanel}
              </div>
            ) : (
              <SplitPane
                key={panelMaximized ? 'maximized' : 'normal'}
                className="editor-split"
                direction="vertical"
                sizes={[
                  panelMaximized ? 100 - MAX_PANEL_PERCENT : 100 - panelPercent,
                  panelMaximized ? MAX_PANEL_PERCENT : panelPercent,
                ]}
                minSize={[160, 110]}
                gutterSize={4}
                onDragEnd={(sizes) => {
                  if (!panelMaximized) {
                    const next = Math.max(10, Math.min(70, Math.round(sizes[1])))
                    setPanelPercent(next)
                    saveWorkspaceUi(workspace.id, { panelPercent: next })
                  }
                }}
              >
                <Pane className="editor-stack-slot">{editorStack}</Pane>
                <Pane className="bottom-slot">{bottomPanel}</Pane>
              </SplitPane>
            )}
          </Pane>
        </SplitPane>
      </div>

      {error ? (
        <div className="workspace-notice" role="alert">
          <i className="codicon codicon-error" />
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError('')}>
            <i className="codicon codicon-close" />
          </button>
        </div>
      ) : null}

      <StatusBar config={config} workspace={workspace} activeFile={activeFile} saving={saving} />
    </div>
  )
}
