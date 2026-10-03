import AdminShell from '@/components/admin-shell'

// Operator pages. The middleware redirects anonymous visitors to /login
// before the authenticated shell renders.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
