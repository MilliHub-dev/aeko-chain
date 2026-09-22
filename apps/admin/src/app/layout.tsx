import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AEKO Chain',
  description: 'AEKO Chain testnet faucet, monitoring and administration',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0d0e16] text-gray-100">{children}</body>
    </html>
  )
}
