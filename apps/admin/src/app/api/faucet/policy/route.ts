import { NextResponse } from 'next/server'
import { getPolicy } from '@/lib/faucet-store'

export const dynamic = 'force-dynamic'

const EXPLORER_URL = (process.env.PUBLIC_EXPLORER_URL ?? 'https://scan.aeko.online').replace(/\/+$/, '')

export async function GET() {
  const policy = await getPolicy()
  return NextResponse.json({ data: { ...policy, explorerUrl: EXPLORER_URL, network: 'testnet' } })
}
