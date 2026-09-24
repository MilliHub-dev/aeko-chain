import { NextRequest, NextResponse } from 'next/server'
import { FundingError, grant } from '@/lib/funding-store'
import { clientIp, throttle } from '@/lib/ip-throttle'
import { fundingCorsHeaders, fundingPreflight } from '@/lib/funding-cors'

export const dynamic = 'force-dynamic'

export const OPTIONS = fundingPreflight

const EXPLORER_URL = (process.env.AEKO_PUBLIC_EXPLORER_URL ?? '').replace(/\/+$/, '')

/**
 * Developer Test Console airdrop.
 *
 * This is deliberately separate from the public funding-approval queue. The
 * browser chooses the amount, while this server keeps the private Funding
 * Gateway credential out of the client and enforces IP and amount ceilings.
 */
export async function POST(req: NextRequest) {
  const cors = fundingCorsHeaders(req)
  const respond = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
    NextResponse.json(body, {
      status: init.status,
      headers: { ...cors, ...(init.headers ?? {}) },
    })

  const wait = throttle(clientIp(req.headers))
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
    return respond({
      data: {
        ...record,
        explorerUrl: EXPLORER_URL ? `${EXPLORER_URL}/explorer/account/${record.address}` : null,
      },
    })
  } catch (err) {
    if (err instanceof FundingError) {
      return respond({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status })
    }
    console.error('test console airdrop failed:', err)
    return respond({ error: { code: 'INTERNAL', message: 'Test Console airdrop failed' } }, { status: 500 })
  }
}
