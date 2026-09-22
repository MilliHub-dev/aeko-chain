import { NextRequest, NextResponse } from 'next/server'
import { FundingError, grant } from '@/lib/funding-store'
import { clientIp, throttle } from '@/lib/ip-throttle'

export const dynamic = 'force-dynamic'

const EXPLORER_URL = (process.env.PUBLIC_EXPLORER_URL ?? 'https://scan.aeko.online').replace(/\/+$/, '')

/**
 * Public: `{ address }` → one policy-sized grant.
 *
 * A trusted Aeko backend may call this on behalf of signed-in users with
 * `x-funding-key: FUNDING_CLIENT_API_KEY`. That skips only the per-IP throttle;
 * wallet cooldown and daily-budget policy still apply.
 */
export async function POST(req: NextRequest) {
  let address = ''
  try {
    address = String(((await req.json()) as { address?: unknown }).address ?? '').trim()
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Send { address }' } }, { status: 400 })
  }

  const apiKey = process.env.FUNDING_CLIENT_API_KEY ?? process.env.FAUCET_API_KEY
  const suppliedKey = req.headers.get('x-funding-key') ?? req.headers.get('x-faucet-key')
  const trusted = Boolean(apiKey) && suppliedKey === apiKey

  if (!trusted) {
    const wait = throttle(clientIp(req.headers))
    if (wait > 0) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: `Too many requests. Try again in ${wait}s.`, retryAfterSeconds: wait } },
        { status: 429, headers: { 'Retry-After': String(wait) } },
      )
    }
  }

  try {
    const record = await grant({ address, source: trusted ? 'backend' : 'public' })
    return NextResponse.json({
      data: {
        ...record,
        explorerUrl: `${EXPLORER_URL}/explorer/account/${record.address}`,
      },
    })
  } catch (err) {
    if (err instanceof FundingError) {
      const headers: Record<string, string> = {}
      if (typeof err.extra.retryAfterSeconds === 'number') headers['Retry-After'] = String(err.extra.retryAfterSeconds)
      return NextResponse.json({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status, headers })
    }
    console.error('funding request failed:', err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Funding request failed' } }, { status: 500 })
  }
}
