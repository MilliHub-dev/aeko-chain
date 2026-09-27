import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminRpcUrl } from '../../../lib/network'

/**
 * Read-only RPC relay for the admin pages (the middleware requires an operator
 * session). This relay is intentionally read-only. Test-network grant approval
 * goes through the authenticated /api/admin/funding/* control plane, which calls
 * the active deployment's Explorer backend. Developer airdrops are separate.
 *
 * This Admin deployment always targets its single AEKO_NETWORK via AEKO_RPC_URL.
 * Cross-network routing belongs to Aeko Scan, not Operations Web.
 */
const isReadOnly = (method: unknown) =>
  typeof method === 'string' && (method.startsWith('get') || method === 'simulateTransaction')

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 })
  }

  const b = body as { method?: string }
  if (!isReadOnly(b.method)) {
    return NextResponse.json(
      { error: { message: `Method not relayed: ${String(b.method)}. Use the Funding API for testnet grants.` } },
      { status: 403 },
    )
  }

  try {
    const res = await fetch(resolveAdminRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'RPC unreachable'
    return NextResponse.json({ error: { message: msg } }, { status: 503 })
  }
}
