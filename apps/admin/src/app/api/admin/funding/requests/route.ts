import { NextRequest, NextResponse } from 'next/server'
import { fundingAdminClient, FundingGatewayError } from '@/lib/funding-admin-client'

export const dynamic = 'force-dynamic'

function gatewayError(err: unknown) {
  if (err instanceof FundingGatewayError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...err.details } },
      { status: err.status },
    )
  }
  console.error('admin funding request gateway failure:', err)
  return NextResponse.json(
    { error: { code: 'FUNDING_GATEWAY_UNAVAILABLE', message: 'Funding Gateway is unavailable' } },
    { status: 502 },
  )
}

export async function GET(req: NextRequest) {
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100))
  try {
    return NextResponse.json({ data: await fundingAdminClient.requests(limit) })
  } catch (err) {
    return gatewayError(err)
  }
}

export async function POST(req: NextRequest) {
  let body: { id?: unknown; action?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Invalid request body' } }, { status: 400 })
  }

  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null
  if (!action) {
    return NextResponse.json(
      { error: { code: 'INVALID_ACTION', message: 'Action must be approve or reject' } },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json({
      data: await fundingAdminClient.decideRequest(String(body.id ?? '').trim(), action),
    })
  } catch (err) {
    return gatewayError(err)
  }
}
