import { NextRequest, NextResponse } from 'next/server'
import { fundingAdminClient, FundingGatewayError } from '@/lib/funding-admin-client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { address?: unknown; amountAeko?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Invalid request body' } }, { status: 400 })
  }

  try {
    const record = await fundingAdminClient.grant(
      String(body.address ?? '').trim(),
      Number(body.amountAeko),
    )
    return NextResponse.json({ data: record })
  } catch (err) {
    if (err instanceof FundingGatewayError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, ...err.details } },
        { status: err.status },
      )
    }
    console.error('admin grant gateway failure:', err)
    return NextResponse.json(
      { error: { code: 'FUNDING_GATEWAY_UNAVAILABLE', message: 'Funding Gateway is unavailable' } },
      { status: 502 },
    )
  }
}
