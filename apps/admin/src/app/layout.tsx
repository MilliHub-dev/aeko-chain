import type { Metadata } from 'next'
import ClientTelemetry from '@/components/ClientTelemetry'
import QueryProvider from '@/components/query-provider'
import { ToasterProvider } from '@/components/toaster'
import './globals.css'

export const metadata: Metadata = {
  title: 'AEKO Operations',
  description: 'Authenticated AEKO Chain monitoring and operations console',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[#0d0e16] text-gray-100">
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
