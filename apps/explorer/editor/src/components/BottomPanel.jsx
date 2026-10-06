import Terminal from '../ide/Terminal'

const TABS = ['TERMINAL', 'OUTPUT', 'PROBLEMS']

export default function BottomPanel({
  workspaceId,
  activeTab,
  onTabChange,
  collapsed,
  maximized,
  onToggleCollapsed,
  onToggleMaximized,
}) {
  return (
    <section className={`bottom-panel ${collapsed ? 'collapsed' : ''}`}>
      <header className="panel-tabs">
        <div>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'active' : ''}
              onClick={() => {
                onTabChange(tab)
                if (collapsed) onToggleCollapsed()
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="panel-controls">
          <button type="button" title={maximized ? 'Restore Panel Size' : 'Maximize Panel Size'} onClick={onToggleMaximized}>
            <i className={`codicon codicon-${maximized ? 'screen-normal' : 'screen-full'}`} />
          </button>
          <button type="button" title={collapsed ? 'Show Panel' : 'Hide Panel'} onClick={onToggleCollapsed}>
            <i className={`codicon codicon-${collapsed ? 'chevron-up' : 'chevron-down'}`} />
          </button>
        </div>
      </header>
      {!collapsed ? (
        <div className="panel-body">
          {activeTab === 'TERMINAL' ? <Terminal workspaceId={workspaceId} /> : null}
          {activeTab === 'OUTPUT' ? (
            <pre className="panel-placeholder">Task output will appear here when commands run through the terminal.</pre>
          ) : null}
          {activeTab === 'PROBLEMS' ? (
            <pre className="panel-placeholder">Monaco diagnostics appear inline in the editor.</pre>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
