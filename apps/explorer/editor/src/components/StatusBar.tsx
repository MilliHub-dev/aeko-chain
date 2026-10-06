import type { StudioConfig } from '../../shared/contracts/session.js'
import type { Workspace } from '../../shared/contracts/workspace.js'

interface ActiveFile {
  path: string
  content: string
}

interface StatusBarProps {
  config: StudioConfig
  workspace: Workspace
  activeFile: ActiveFile | null
  saving: boolean
}

export default function StatusBar({ config, workspace, activeFile, saving }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <div>
        <span><i className="codicon codicon-source-control" /> main</span>
        <span><i className="codicon codicon-error" /> 0</span>
        <span><i className="codicon codicon-warning" /> 0</span>
      </div>
      <div>
        {saving ? <span>Saving…</span> : <span>Workspace saved</span>}
        <span>{workspace.templateLabel || 'AEKO project'}</span>
        <span>{activeFile?.path.split('.').pop()?.toUpperCase() || '—'}</span>
        <span>{config.network || 'network'}</span>
        <span><i className="codicon codicon-radio-tower" /> AEKO</span>
      </div>
    </footer>
  )
}
