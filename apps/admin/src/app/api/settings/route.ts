import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminExplorerUrl } from '../../../lib/network'
import { logger, requestIdFromHeaders } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const SETTINGS_TOKEN = process.env.AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN ?? ''
const SETTINGS_TIMEOUT_MS = 20_000

async function explorerSettings(requestId: string, init?: RequestInit) {
  const explorerUrl = resolveAdminExplorerUrl()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SETTINGS_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const headers = new Headers(init?.headers)
    headers.set('x-request-id', requestId)
    const response = await fetch(`${explorerUrl}/settings`, {
      cache: 'no-store',
      ...init,
      headers,
      signal: controller.signal,
    })
    const text = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      logger.error('settings_proxy_invalid_upstream_response', {
        request_id: requestId,
        status: response.status,
        latency_ms: Date.now() - startedAt,
      })
      return NextResponse.json(
        { error: { message: 'Explorer settings service returned an invalid response' } },
        { status: 502, headers: { 'x-request-id': requestId } },
      )
    }
    logger.info('settings_proxy_completed', {
      request_id: requestId,
      method: init?.method ?? 'GET',
      status: response.status,
      latency_ms: Date.now() - startedAt,
    })
    return NextResponse.json(payload, { status: response.status, headers: { 'x-request-id': requestId } })
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    logger.error(timedOut ? 'settings_proxy_timeout' : 'settings_proxy_failed', {
      request_id: requestId,
      method: init?.method ?? 'GET',
      latency_ms: Date.now() - startedAt,
      error,
    })
    return NextResponse.json(
      { error: { message: timedOut ? 'Explorer settings service timed out' : 'Explorer settings service unavailable' } },
      { status: timedOut ? 504 : 503, headers: { 'x-request-id': requestId } },
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  return explorerSettings(requestIdFromHeaders(req.headers))
}

export async function PATCH(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  if (SETTINGS_TOKEN.length < 32) {
    logger.error('settings_control_unconfigured', { request_id: requestId })
    return NextResponse.json(
      { error: { message: 'Explorer settings control plane is not configured' } },
      { status: 503, headers: { 'x-request-id': requestId } },
    )
  }

  const body = await req.text()
  return explorerSettings(requestId, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-aeko-settings-token': SETTINGS_TOKEN,
    },
    body,
  })
}
