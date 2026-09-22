import { NextRequest, NextResponse } from 'next/server'
import { getPolicy } from '@/lib/funding-store'\nimport { fundingCorsHeaders, fundingPreflight } from '@/lib/funding-cors'

export const dynamic = 'force-dynamic'\n\nexport const OPTIONS = fundingPreflight

const EXPLORER_URL = (process.env.PUBLIC_EXPLORER_URL ?? 'https://scan.aeko.online').replace(/\/+$/, '')
const ADMIN_URL = process.env.ADMIN_PUBLIC_HOST ? `https://${process.env.ADMIN_PUBLIC_HOST}` : ''

export async function GET(req: NextRequest) {
  const policy = await getPolicy()
  return NextResponse.json({ data: { ...policy, explorerUrl: EXPLORER_URL, adminUrl: ADMIN_URL, network: 'testnet' } })
}
