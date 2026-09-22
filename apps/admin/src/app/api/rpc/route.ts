import { NextRequest, NextResponse } from 'next/server'

const RPC_URL = process.env.AEKO_RPC_URL ?? 'http://localhost:8899'

/**
 * Read-only RPC relay for the admin pages (the middleware requires an operator
 * session). Airdrops go through /api/faucet/request, where the policy lives,
 * and nothing that submits or mutates is relayed at all.
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
      { error: { message: `Method not relayed: ${String(b.method)}. Use the faucet API for airdrops.` } },
      { status: 403 },
    )
  }

  try {
    const res = await fetch(RPC_URL, {
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
