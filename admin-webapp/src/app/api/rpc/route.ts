import { NextRequest, NextResponse } from 'next/server'

const RPC_URL = process.env.AEKO_RPC_URL ?? 'http://localhost:8899'
const MAX_AIRDROP_LAMPORTS = Number(process.env.FAUCET_MAX_AEKO ?? 10) * 1_000_000_000

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 })
  }

  const b = body as { method?: string; params?: unknown[] }

  if (b.method === 'requestAirdrop' && Array.isArray(b.params)) {
    const lamports = b.params[1]
    if (typeof lamports !== 'number' || lamports <= 0 || lamports > MAX_AIRDROP_LAMPORTS) {
      return NextResponse.json(
        { error: { message: `Airdrop capped at ${MAX_AIRDROP_LAMPORTS / 1e9} AEKO` } },
        { status: 400 },
      )
    }
  }

  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'RPC unreachable'
    return NextResponse.json({ error: { message: msg } }, { status: 503 })
  }
}
