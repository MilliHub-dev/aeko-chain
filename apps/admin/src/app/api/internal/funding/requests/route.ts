import { NextRequest, NextResponse } from 'next/server'
import { decideFundingRequest, FundingError, listFundingRequests } from '@/lib/funding-store'
import { isAuthorizedFundingAdminRequest } from '@/lib/funding-internal-auth'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 })
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedFundingAdminRequest(req)) return unauthorized()
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100))
  return NextResponse.json({ data: await listFundingRequests(limit) })
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedFundingAdminRequest(req)) return unauthorized()

  let body: { id?: unknown; action?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Invalid request body' } }, { status: 400 })
  }

  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null
  if (!action) {
    return NextResponse.json(
      { error: { code: 'INVALID_ACTION', message: 'Action must be approve or reject' } },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json({
      data: await decideFundingRequest(String(body.id ?? '').trim(), action),
    })
  } catch (err) {
    if (err instanceof FundingError) {
      return NextResponse.json({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status })
    }
    console.error('internal funding request decision failed:', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Funding request decision failed' } },
      { status: 500 },
    )
  }
}
