import { NextRequest } from 'next/server'
import { fundingAdminRequest } from '@/lib/funding-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  return fundingAdminRequest('/admin/funding/settings')
}

export async function PUT(req: NextRequest) {
  return fundingAdminRequest('/admin/funding/settings', {
    method: 'PATCH',
    body: await req.text(),
  })
}
