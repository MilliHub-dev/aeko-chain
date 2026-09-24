import { NextRequest, NextResponse } from 'next/server'
import { getPolicy } from '@/lib/funding-store'
import { fundingCorsHeaders, fundingPreflight } from '@/lib/funding-cors'

export const dynamic = 'force-dynamic'
export const OPTIONS = fundingPreflight

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { data: { ...(await getPolicy()), network: 'testnet' } },
    { headers: fundingCorsHeaders(req) },
  )
}
