interface ActivityBarProps { onHome: () => void; onLogout: () => void }

const ITEMS = [
  ['CO', 'Code', true],
  ['CT', 'Contracts', false],
  ['DP', 'Deployments', false],
  ['IN', 'Interact', false],
  ['AC', 'Accounts', false],
  ['TX', 'Transactions', false],
] as const

export default function ActivityBar({ onHome, onLogout }: ActivityBarProps) {
  return (
    <nav className="activity-bar" aria-label="AEKO Studio">
      <div className="activity-brand" aria-label="AEKO">A</div>
      <div className="activity-items">
        {ITEMS.map(([mark, label, enabled], index) => (
          <button key={label} type="button" className={index === 0 ? 'active' : ''} disabled={!enabled}
            title={enabled ? label : `${label} requires chain or wallet integration`}>
            <span className="rail-mark">{mark}</span><span className="rail-label">{label}</span>
          </button>
        ))}
      </div>
      <div className="activity-footer">
        <button type="button" onClick={onHome}><span className="rail-mark">PR</span><span className="rail-label">Projects</span></button>
        <button type="button" onClick={onLogout}><span className="rail-mark">EX</span><span className="rail-label">Sign out</span></button>
      </div>
    </nav>
  )
}
