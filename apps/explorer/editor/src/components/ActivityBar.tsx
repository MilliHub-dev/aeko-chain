import { Blocks, Boxes, Code2, FolderKanban, LogOut, RadioTower, Rocket, WalletCards } from 'lucide-react'

interface ActivityBarProps { onHome: () => void; onLogout: () => void }

const ITEMS = [
  [Code2, 'Code', true],
  [Blocks, 'Contracts', false],
  [Rocket, 'Deployments', false],
  [RadioTower, 'Interact', false],
  [WalletCards, 'Accounts', false],
  [Boxes, 'Transactions', false],
] as const

export default function ActivityBar({ onHome, onLogout }: ActivityBarProps) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center border-r border-white/10 bg-aeko-dark py-3" aria-label="AEKO Studio">
      <div className="mb-4 grid size-9 place-items-center rounded-xl bg-aeko-accent font-black text-aeko-dark" aria-label="AEKO">A</div>
      <div className="flex flex-1 flex-col gap-1">
        {ITEMS.map(([Icon, label, enabled], index) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-current={index === 0 ? 'page' : undefined}
            disabled={!enabled}
            title={enabled ? label : `${label} requires chain or wallet integration`}
            className="relative grid size-10 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 aria-[current=page]:bg-aeko-accent/10 aria-[current=page]:text-aeko-accent"
          >
            <Icon className="size-5" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <button type="button" aria-label="Projects" title="Projects" onClick={onHome} className="grid size-10 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/10 hover:text-white">
          <FolderKanban className="size-5" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Sign out" title="Sign out" onClick={onLogout} className="grid size-10 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/10 hover:text-white">
          <LogOut className="size-5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
