import { NextRequest, NextResponse } from 'next/server'
import { FundingError, getPolicy, getSettings, updateSettings } from '@/lib/funding-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [settings, policy] = await Promise.all([getSettings(), getPolicy()])
  return NextResponse.json({ data: { settings, dailyRemainingAeko: policy.dailyRemainingAeko } })
}

export async function PUT(req: NextRequest) {
  let patch: Record<string, unknown>
  try {
    patch = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 })
  }
  try {
    const settings = await updateSettings(patch)
    return NextResponse.json({ data: { settings } })
  } catch (err) {
    if (err instanceof FundingError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status })
    }
    throw err
  }
}
