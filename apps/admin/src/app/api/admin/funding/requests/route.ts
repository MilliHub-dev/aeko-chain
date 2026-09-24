import { NextRequest, NextResponse } from 'next/server'
import {
  decideFundingRequest,
  FundingError,
  listFundingRequests,
} from '@/lib/funding-store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100))
  return NextResponse.json({ data: await listFundingRequests(limit) })
}

export async function POST(req: NextRequest) {
  let body: { id?: unknown; action?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: { message: 'Invalid request body' } }, { status: 400 })
  }

  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null
  if (!action) {
    return NextResponse.json(
      { error: { code: 'INVALID_ACTION', message: 'Action must be approve or reject' } },
      { status: 400 },
    )
  }

  try {
    const request = await decideFundingRequest(String(body.id ?? '').trim(), action)
    return NextResponse.json({ data: request })
  } catch (err) {
    if (err instanceof FundingError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, ...err.extra } },
        { status: err.status },
      )
    }
    console.error('funding request decision failed:', err)
    return NextResponse.json({ error: { message: 'Funding request decision failed' } }, { status: 500 })
  }
}
