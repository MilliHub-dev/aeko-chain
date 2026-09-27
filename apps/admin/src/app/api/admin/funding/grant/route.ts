import { NextRequest } from 'next/server'
import { fundingAdminRequest } from '@/lib/funding-api'
import { requestIdFromHeaders } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  return fundingAdminRequest('/admin/funding/grant', {
    method: 'POST',
    body: await req.text(),
  }, requestId)
}
