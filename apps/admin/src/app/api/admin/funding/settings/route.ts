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
  console.error('admin funding settings gateway failure:', err)
  return NextResponse.json(
    { error: { code: 'FUNDING_GATEWAY_UNAVAILABLE', message: 'Funding Gateway is unavailable' } },
    { status: 502 },
  )
}

export async function GET() {
  try {
    return NextResponse.json({ data: await fundingAdminClient.settings() })
  } catch (err) {
    return gatewayError(err)
  }
}

export async function PUT(req: NextRequest) {
  let patch: Record<string, unknown>
  try {
    patch = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Invalid request body' } }, { status: 400 })
  }

  try {
    return NextResponse.json({ data: await fundingAdminClient.updateSettings(patch) })
  } catch (err) {
    return gatewayError(err)
  }
}
