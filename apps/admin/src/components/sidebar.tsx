'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type NavIcon =
  | 'dashboard'
  | 'blocks'
  | 'transactions'
  | 'tokens'
  | 'nfts'
  | 'social'
  | 'protocol'
  | 'marketplace'
  | 'funding'
  | 'settings'

const NAV: Array<{ href: string; label: string; icon: NavIcon }> = [
  { href: '/', label: 'Dashboard', icon: 'dashboard' },
  { href: '/blocks', label: 'Blocks', icon: 'blocks' },
  { href: '/transactions', label: 'Transactions', icon: 'transactions' },
  { href: '/tokens', label: 'Tokens', icon: 'tokens' },
  { href: '/nfts', label: 'NFTs', icon: 'nfts' },
  { href: '/social', label: 'Social', icon: 'social' },
  { href: '/protocol', label: 'Protocol', icon: 'protocol' },
  { href: '/marketplace', label: 'Marketplace', icon: 'marketplace' },
  { href: '/funding', label: 'Funding', icon: 'funding' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
]

export default function Sidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean
  onMobileClose: () => void
}) {
  return (
    <>
      <aside className="hidden h-dvh w-60 shrink-0 flex-col border-r border-[#1e2135] bg-[#0a0b12] lg:flex">
        <NavigationContent />
      </aside>
      {mobileOpen ? <MobileNavigation onClose={onMobileClose} /> : null}
    </>
  )
}

function MobileNavigation({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        id="admin-mobile-navigation"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="AEKO Operations navigation"
        className="absolute inset-y-0 left-0 flex w-[min(88vw,19rem)] flex-col border-r border-[#252a3e] bg-[#0a0b12] shadow-2xl shadow-black/60"
      >
        <NavigationContent mobile closeRef={closeRef} onNavigate={onClose} />
      </aside>
    </div>
  )
}

function NavigationContent({
  mobile = false,
  closeRef,
  onNavigate,
}: {
  mobile?: boolean
  closeRef?: React.RefObject<HTMLButtonElement>
  onNavigate?: () => void
}) {
  const path = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <>
      <div className="flex min-h-20 shrink-0 items-center justify-between gap-3 border-b border-[#1e2135] px-4">
        <div className="min-w-0">
          <div className="truncate text-base font-bold tracking-wide text-emerald-300">AEKO Operations</div>
          <div className="mt-0.5 text-xs text-gray-600">Admin Console</div>
        </div>
        {mobile ? (
          <button
            ref={closeRef}
            type="button"
            onClick={onNavigate}
            aria-label="Close navigation"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#262a3d] text-gray-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain px-3 py-4" aria-label="Admin sections">
        {NAV.map(({ href, label, icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={
                'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ' +
                (active
                  ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                  : 'border border-transparent text-gray-400 hover:bg-white/[0.045] hover:text-gray-100')
              }
            >
              <span className="flex size-7 shrink-0 items-center justify-center">
                <NavigationIcon icon={icon} />
              </span>
              <span className="truncate">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-[#1e2135] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={logout}
          className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-gray-500 transition-colors hover:bg-red-400/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
        >
          Sign out
        </button>
        <div className="px-3 pt-2 text-[10px] uppercase tracking-[0.14em] text-gray-700">AEKO Chain v2.0</div>
      </div>
    </>
  )
}

function NavigationIcon({ icon }: { icon: NavIcon }) {
  const paths: Record<NavIcon, React.ReactNode> = {
    dashboard: <><path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z" /></>,
    blocks: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /><path d="M14 4h6v6M4 14v6h6" /></>,
    transactions: <><path d="M5 7h13m0 0-3-3m3 3-3 3M19 17H6m0 0 3 3m-3-3 3-3" /></>,
    tokens: <><circle cx="12" cy="12" r="8" /><path d="M9 10.2c0-1.2 1.2-2.2 3-2.2s3 .8 3 2-1.1 1.8-3 2c-1.9.2-3 1-3 2.1 0 1.2 1.2 2.1 3 2.1s3-.8 3-2.1M12 6.5v11" /></>,
    nfts: <><path d="M6 4h12l2 4-8 12L4 8l2-4Z" /><path d="m4 8 8 3 8-3M8 4l4 7 4-7" /></>,
    social: <><circle cx="8" cy="9" r="3" /><circle cx="17" cy="7" r="2.5" /><path d="M3.5 19c.6-3.2 2.1-5 4.5-5s3.9 1.8 4.5 5M13.5 14.5c.8-1.5 2-2.3 3.6-2.3 2 0 3.2 1.3 3.7 3.8" /></>,
    protocol: <><path d="M12 3 4.5 7.2v9.6L12 21l7.5-4.2V7.2L12 3Z" /><path d="m4.8 7.4 7.2 4 7.2-4M12 11.4V21" /></>,
    marketplace: <><path d="M4 9h16l-1.5-5h-13L4 9Z" /><path d="M5 9v10h14V9M9 19v-5h6v5" /></>,
    funding: <><path d="M4 7.5h16v11H4v-11Z" /><path d="M7 7.5V5h10v2.5M8 13h8M12 10v6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.5 1a7 7 0 0 0-2-1.2L14 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.5-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.5-1a7 7 0 0 0 2 1.2L10 21h4l.4-2.7a7 7 0 0 0 2-1.2l2.5 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" /></>,
  }

  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[icon]}
    </svg>
  )
}
