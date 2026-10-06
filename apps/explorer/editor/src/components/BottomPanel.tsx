import StudioConsole from '../ide/StudioConsole'

interface BottomPanelProps {
  workspaceId: string
  collapsed: boolean
  onToggleCollapsed: () => void
}

export default function BottomPanel({ workspaceId, collapsed, onToggleCollapsed }: BottomPanelProps) {
  return (
    <section className={`bottom-panel ${collapsed ? 'collapsed' : ''}`}>
      <header className="panel-tabs">
        <div className="panel-heading">
          <strong>Console</strong>
          <span>Build · test · run</span>
        </div>
        <button type="button" className="panel-toggle" onClick={onToggleCollapsed}>
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </header>
      {!collapsed ? <div className="panel-body"><StudioConsole workspaceId={workspaceId} /></div> : null}
    </section>
  )
}
