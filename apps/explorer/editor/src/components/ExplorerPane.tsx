import { useMemo, useState } from 'react'
import type { FileEntry } from '../../shared/contracts/filesystem.js'
import type { Workspace } from '../../shared/contracts/workspace.js'
import { fileIcon } from '../lib/language'

interface ExplorerPaneProps {
  workspace: Workspace
  entries: FileEntry[]
  activePath: string
  onOpen: (path: string) => void | Promise<void>
  onNewFile: () => void | Promise<void>
  onNewDirectory: () => void | Promise<void>
  onRename: (entry: FileEntry) => void | Promise<void>
  onDelete: (entry: FileEntry) => void | Promise<void>
  onRefresh: () => void
}

function hiddenByCollapsedDirectory(entry: FileEntry, collapsed: ReadonlySet<string>): boolean {
  const parts = entry.path.split('/')
  parts.pop()
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    if (collapsed.has(current)) return true
  }
  return false
}

export default function ExplorerPane({
  workspace,
  entries,
  activePath,
  onOpen,
  onNewFile,
  onNewDirectory,
  onRename,
  onDelete,
  onRefresh,
}: ExplorerPaneProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const visible = useMemo(
    () => entries.filter((entry) => !hiddenByCollapsedDirectory(entry, collapsed)),
    [collapsed, entries],
  )

  const toggleDirectory = (path: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <aside className="explorer-pane">
      <div className="pane-title">EXPLORER</div>
      <div className="workspace-heading">
        <strong title={workspace.name}>{workspace.name.toUpperCase()}</strong>
        <div className="pane-actions">
          <button type="button" title="New File" onClick={() => void onNewFile()}><i className="codicon codicon-new-file" /></button>
          <button type="button" title="New Folder" onClick={() => void onNewDirectory()}><i className="codicon codicon-new-folder" /></button>
          <button type="button" title="Refresh" onClick={onRefresh}><i className="codicon codicon-refresh" /></button>
        </div>
      </div>
      <div className="file-tree" role="tree" aria-label="Project files">
        {visible.map((entry) => {
          const directory = entry.type === 'directory'
          const isCollapsed = directory && collapsed.has(entry.path)
          return (
            <div
              key={entry.path}
              className={`file-row ${activePath === entry.path ? 'active' : ''}`}
              style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
              role="treeitem"
              aria-expanded={directory ? !isCollapsed : undefined}
            >
              <button
                type="button"
                className="file-open"
                title={entry.path}
                onClick={() => directory ? toggleDirectory(entry.path) : void onOpen(entry.path)}
              >
                {directory ? (
                  <>
                    <i className={`codicon codicon-chevron-${isCollapsed ? 'right' : 'down'}`} aria-hidden="true" />
                    <i className={`codicon codicon-folder${isCollapsed ? '' : '-opened'}`} aria-hidden="true" />
                  </>
                ) : (
                  <span className="tree-indent-spacer" aria-hidden="true" />
                )}
                {!directory ? <i className={`codicon codicon-${fileIcon(entry.path)}`} aria-hidden="true" /> : null}
                <span>{entry.name}</span>
              </button>
              <div className="file-actions">
                <button type="button" title="Rename" onClick={() => void onRename(entry)}>
                  <i className="codicon codicon-edit" />
                </button>
                <button type="button" title="Delete" onClick={() => void onDelete(entry)}>
                  <i className="codicon codicon-trash" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
