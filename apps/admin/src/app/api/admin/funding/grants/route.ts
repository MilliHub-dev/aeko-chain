import { NextRequest, NextResponse } from 'next/server'
import { fundingAdminClient, FundingGatewayError } from '@/lib/funding-admin-client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100))
  try {
    return NextResponse.json({ data: await fundingAdminClient.grants(limit) })
  } catch (err) {
    if (err instanceof FundingGatewayError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, ...err.details } },
        { status: err.status },
      )
    }
    console.error('admin funding grants gateway failure:', err)
    return NextResponse.json(
      { error: { code: 'FUNDING_GATEWAY_UNAVAILABLE', message: 'Funding Gateway is unavailable' } },
      { status: 502 },
    )
  }
}
