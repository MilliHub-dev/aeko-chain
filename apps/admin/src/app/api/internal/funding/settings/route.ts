import { NextRequest, NextResponse } from 'next/server'
import { FundingError, getPolicy, getSettings, updateSettings } from '@/lib/funding-store'
import { isAuthorizedFundingAdminRequest } from '@/lib/funding-internal-auth'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 })
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedFundingAdminRequest(req)) return unauthorized()
  const [settings, policy] = await Promise.all([getSettings(), getPolicy()])
  return NextResponse.json({ data: { settings, dailyRemainingAeko: policy.dailyRemainingAeko } })
}

export async function PUT(req: NextRequest) {
  if (!isAuthorizedFundingAdminRequest(req)) return unauthorized()
  let patch: Record<string, unknown>
  try {
    patch = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Invalid request body' } }, { status: 400 })
  }

  try {
    const settings = await updateSettings(patch)
    return NextResponse.json({ data: { settings } })
  } catch (err) {
    if (err instanceof FundingError) {
      return NextResponse.json({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status })
    }
    throw err
  }
}
