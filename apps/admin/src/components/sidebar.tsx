'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/',              label: 'Dashboard',     icon: '⬡' },
  { href: '/blocks',        label: 'Blocks',        icon: '◻' },
  { href: '/transactions',  label: 'Transactions',  icon: '⇄' },
  { href: '/tokens',        label: 'Tokens',        icon: '◈' },
  { href: '/nfts',          label: 'NFTs',          icon: '◉' },
  { href: '/social',        label: 'Social',        icon: '◎' },
  { href: '/marketplace',   label: 'Marketplace',   icon: '◆' },
  { href: '/faucet',        label: 'Faucet',        icon: '◇' },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-[#1e2135] bg-[#0a0b12] min-h-screen">
      <div className="px-5 py-6 border-b border-[#1e2135]">
        <div className="text-emerald-400 font-bold text-lg tracking-wide">AEKO Admin</div>
        <div className="text-gray-500 text-xs mt-0.5">Chain Monitor</div>
      </div>

      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {NAV.map(({ href, label, icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[#1e2135] text-xs text-gray-600">
        AEKO Chain v2.0
      </div>
    </aside>
  )
}
