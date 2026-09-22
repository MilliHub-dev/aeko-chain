import { NextRequest, NextResponse } from 'next/server'
import { getPolicy } from '@/lib/funding-store'
import { fundingCorsHeaders, fundingPreflight } from '@/lib/funding-cors'

export const dynamic = 'force-dynamic'

export const OPTIONS = fundingPreflight

const EXPLORER_URL = (process.env.AEKO_PUBLIC_EXPLORER_URL ?? '').replace(/\/+$/, '')
const ADMIN_URL = (process.env.AEKO_PUBLIC_ADMIN_URL ?? '').replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  const policy = await getPolicy()
  return NextResponse.json(
    { data: { ...policy, explorerUrl: EXPLORER_URL, adminUrl: ADMIN_URL, network: 'testnet' } },
    { headers: fundingCorsHeaders(req) },
  )
}
