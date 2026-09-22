import Sidebar from '@/components/sidebar'
import SearchBar from '@/components/search-bar'

// Operator pages. The middleware already redirects anonymous visitors to
// /login before anything here renders.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <header className="border-b border-[#1e2135] px-6 py-3 flex items-center gap-4 bg-[#0a0b12]">
          <SearchBar />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
