import { NextRequest, NextResponse } from 'next/server'
import { FaucetError, grant } from '@/lib/faucet-store'

export const dynamic = 'force-dynamic'

/** Operator grant: any amount up to maxManualGrantAeko, no cooldown or budget. */
export async function POST(req: NextRequest) {
  let body: { address?: unknown; amountAeko?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 })
  }
  try {
    const record = await grant({
      address: String(body.address ?? '').trim(),
      amountAeko: Number(body.amountAeko),
      source: 'admin',
    })
    return NextResponse.json({ data: record })
  } catch (err) {
    if (err instanceof FaucetError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status })
    }
    console.error('admin grant failed:', err)
    return NextResponse.json({ error: { message: 'Grant failed' } }, { status: 500 })
  }
}
