import { NextRequest, NextResponse } from 'next/server'
import { FundingError, grant, listGrants } from '@/lib/funding-store'
import { isAuthorizedFundingAdminRequest } from '@/lib/funding-internal-auth'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 })
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedFundingAdminRequest(req)) return unauthorized()
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100))
  return NextResponse.json({ data: await listGrants(limit) })
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedFundingAdminRequest(req)) return unauthorized()

  let body: { address?: unknown; amountAeko?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Invalid request body' } }, { status: 400 })
  }

  try {
    const record = await grant({
      address: String(body.address ?? '').trim(),
      amountAeko: Number(body.amountAeko),
      source: 'admin',
    })
    return NextResponse.json({ data: record })
  } catch (err) {
    if (err instanceof FundingError) {
      return NextResponse.json({ error: { code: err.code, message: err.message, ...err.extra } }, { status: err.status })
    }
    console.error('internal funding grant failed:', err)
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Grant failed' } }, { status: 500 })
  }
}
