export default function StatusBar({ config, workspace, activeFile, saving }) {
  return (
    <footer className="status-bar">
      <div>
        <span><i className="codicon codicon-source-control" /> main</span>
        <span><i className="codicon codicon-error" /> 0</span>
        <span><i className="codicon codicon-warning" /> 0</span>
      </div>
      <div>
        {saving ? <span>Saving…</span> : <span>Workspace saved</span>}
        <span>{workspace?.templateLabel || 'AEKO project'}</span>
        <span>{activeFile?.path?.split('.').pop()?.toUpperCase() || '—'}</span>
        <span>{config?.network || 'network'}</span>
        <span><i className="codicon codicon-radio-tower" /> AEKO</span>
      </div>
    </footer>
  )
}
