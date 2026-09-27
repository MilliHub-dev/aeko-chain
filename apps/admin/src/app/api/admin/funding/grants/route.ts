import { NextRequest } from 'next/server'
import { fundingAdminRequest } from '@/lib/funding-api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100))
  return fundingAdminRequest(`/admin/funding/grants?limit=${limit}`)
}
