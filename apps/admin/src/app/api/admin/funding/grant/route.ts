import { NextRequest } from 'next/server'
import { fundingAdminRequest } from '@/lib/funding-api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return fundingAdminRequest('/admin/funding/grant', {
    method: 'POST',
    body: await req.text(),
  })
}
