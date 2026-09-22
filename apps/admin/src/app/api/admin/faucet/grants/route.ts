import { NextRequest, NextResponse } from 'next/server'
import { listGrants } from '@/lib/faucet-store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100))
  return NextResponse.json({ data: await listGrants(limit) })
}
