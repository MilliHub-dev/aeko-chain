import { NextRequest } from 'next/server'
import { fundingAdminRequest } from '@/lib/funding-api'
import { requestIdFromHeaders } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return fundingAdminRequest('/admin/funding/settings', {}, requestIdFromHeaders(req.headers))
}

export async function PUT(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  return fundingAdminRequest('/admin/funding/settings', {
    method: 'PATCH',
    body: await req.text(),
  }, requestId)
}
