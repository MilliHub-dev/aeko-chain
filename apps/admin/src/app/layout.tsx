import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/sidebar'
import SearchBar from '@/components/search-bar'

export const metadata: Metadata = {
  title: 'AEKO Admin',
  description: 'AEKO Chain monitoring and administration',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-[#0d0e16] text-gray-100">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-auto">
          <header className="border-b border-[#1e2135] px-6 py-3 flex items-center gap-4 bg-[#0a0b12]">
            <SearchBar />
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  )
}
