'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import SearchBar from '@/components/search-bar'
import Sidebar from '@/components/sidebar'

const ROUTE_LABELS = [
  { prefix: '/transactions', label: 'Transactions' },
  { prefix: '/accounts', label: 'Account' },
  { prefix: '/blocks', label: 'Blocks' },
  { prefix: '/tokens', label: 'Tokens' },
  { prefix: '/nfts', label: 'NFTs' },
  { prefix: '/social', label: 'Social' },
  { prefix: '/protocol', label: 'Protocol' },
  { prefix: '/marketplace', label: 'Marketplace' },
  { prefix: '/funding', label: 'Funding' },
  { prefix: '/settings', label: 'Settings' },
] as const

function routeLabel(pathname: string) {
  if (pathname === '/') return 'Dashboard'
  return ROUTE_LABELS.find((item) => pathname.startsWith(item.prefix))?.label ?? 'Operations'
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)

  useEffect(() => {
    setMobileNavigationOpen(false)
  }, [pathname])

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-[#0d0e16]">
      <a
        href="#admin-main"
        className="sr-only z-[120] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <Sidebar
        mobileOpen={mobileNavigationOpen}
        onMobileClose={() => setMobileNavigationOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-40 flex h-16 shrink-0 items-center gap-3 border-b border-[#1e2135] bg-[#0a0b12]/95 px-3 backdrop-blur sm:gap-4 sm:px-5 lg:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            aria-controls="admin-mobile-navigation"
            aria-expanded={mobileNavigationOpen}
            onClick={() => setMobileNavigationOpen(true)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#262a3d] bg-[#12141f] text-gray-300 transition-colors hover:border-[#39405c] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>

          <div className="hidden min-w-0 xl:block">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">AEKO Operations</div>
            <div className="truncate text-sm font-semibold text-gray-200">{routeLabel(pathname)}</div>
          </div>

          <SearchBar />
        </header>

        <main
          id="admin-main"
          tabIndex={-1}
          className="min-w-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain scroll-smooth outline-none [scrollbar-gutter:stable]"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
