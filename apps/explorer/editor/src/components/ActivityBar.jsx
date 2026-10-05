const ITEMS = [
  ['files', 'Explorer', true],
  ['search', 'Search', false],
  ['source-control', 'Source Control', false],
  ['debug-alt', 'Run and Debug', false],
  ['extensions', 'Extensions', false],
]

export default function ActivityBar({ onHome, onLogout }) {
  return (
    <nav className="activity-bar" aria-label="IDE activity">
      <div>
        {ITEMS.map(([icon, label, enabled], index) => (
          <button
            key={label}
            type="button"
            className={index === 0 ? 'active' : ''}
            title={enabled ? label : `${label} is not enabled in this Studio release`}
            aria-label={label}
            disabled={!enabled}
          >
            <i className={`codicon codicon-${icon}`} />
          </button>
        ))}
      </div>
      <div>
        <button type="button" title="Projects" aria-label="Projects" onClick={onHome}><i className="codicon codicon-account" /></button>
        <button type="button" title="Sign out" aria-label="Sign out" onClick={onLogout}><i className="codicon codicon-sign-out" /></button>
      </div>
    </nav>
  )
}
