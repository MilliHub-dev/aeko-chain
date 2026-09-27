import { NextRequest, NextResponse } from 'next/server'
import { fundingAdminRequest } from '@/lib/funding-api'
import { logger, requestIdFromHeaders } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100))
  return fundingAdminRequest(`/admin/funding/requests?limit=${limit}`, {}, requestId)
}

export async function POST(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  let body: { id?: unknown; action?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    logger.warn('funding_decision_invalid_body', { request_id: requestId })
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Send { id, action }' } },
      { status: 400, headers: { 'x-request-id': requestId } },
    )
  }

  const id = String(body.id ?? '').trim()
  const action = body.action === 'approve' || body.action === 'reject' || body.action === 'reconcile'
    ? body.action
    : ''
  if (!id || !action) {
    logger.warn('funding_decision_invalid', { request_id: requestId, action })
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_DECISION',
          message: 'A request id and approve/reject/reconcile action are required',
        },
      },
      { status: 400, headers: { 'x-request-id': requestId } },
    )
  }

  if (action === 'reconcile') {
    return fundingAdminRequest(
      `/admin/funding/requests/${encodeURIComponent(id)}/reconcile`,
      { method: 'POST' },
      requestId,
    )
  }

  return fundingAdminRequest(
    `/admin/funding/requests/${encodeURIComponent(id)}/decide`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: action === 'approve' }),
    },
    requestId,
  )
}
