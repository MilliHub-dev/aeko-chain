import Sidebar from '@/components/sidebar'
import SearchBar from '@/components/search-bar'

// Operator pages. The middleware already redirects anonymous visitors to
// /login before anything here renders.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen min-h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-[#1e2135] bg-[#0a0b12]/95 px-4 backdrop-blur sm:px-6">
          <SearchBar />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
