import { NextRequest, NextResponse } from 'next/server'
import { FundingError, grant } from '@/lib/funding-store'
import { clientIp, throttle } from '@/lib/ip-throttle'
import { fundingCorsHeaders, fundingPreflight } from '@/lib/funding-cors'

export const dynamic = 'force-dynamic'
export const OPTIONS = fundingPreflight

/**
 * Developer Test Console airdrop.
 *
 * This is separate from the public approval queue. The browser chooses the
 * amount; the Funding Gateway keeps Faucet authorization server-side and
 * enforces independent IP and amount ceilings.
 */
export async function POST(req: NextRequest) {
  const cors = fundingCorsHeaders(req)
  const respond = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
    NextResponse.json(body, {
      status: init.status,
      headers: { ...cors, ...(init.headers ?? {}) },
    })

  const wait = throttle(clientIp(req.headers), 'console-airdrop')
  if (wait > 0) {
    return respond(
      { error: { code: 'RATE_LIMITED', message: `Too many Test Console airdrops. Try again in ${wait}s.`, retryAfterSeconds: wait } },
      { status: 429, headers: { 'Retry-After': String(wait) } },
    )
  }

  let body: { address?: unknown; amountAeko?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return respond({ error: { code: 'INVALID_BODY', message: 'Send { address, amountAeko }' } }, { status: 400 })
  }

  try {
    const record = await grant({
      address: String(body.address ?? '').trim(),
      amountAeko: Number(body.amountAeko),
      source: 'console',
    })
    return respond({ data: record })
  } catch (err) {
    if (err instanceof FundingError) {
      return respond({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status })
    }
    console.error('test console airdrop failed:', err)
    return respond({ error: { code: 'INTERNAL', message: 'Test Console airdrop failed' } }, { status: 500 })
  }
}
