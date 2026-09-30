import type { Metadata } from 'next'
import ClientTelemetry from '@/components/ClientTelemetry'
import QueryProvider from '@/components/query-provider'
import { ToasterProvider } from '@/components/toaster'
import './globals.css'

export const metadata: Metadata = {
  title: 'AEKO Chain',
  description: 'AEKO Chain testnet faucet, monitoring and administration',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0d0e16] text-gray-100">
        <QueryProvider>
          <ToasterProvider>
            <ClientTelemetry />
            {children}
          </ToasterProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
