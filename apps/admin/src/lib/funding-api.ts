import { NextResponse } from 'next/server'
import { resolveAdminExplorerUrl } from './network'
import { logger } from './logger'

const SETTINGS_TOKEN = (process.env.AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN ?? '').trim()
const TIMEOUT_MS = 20_000

type ExplorerError = {
  error?: {
    code?: string
    message?: string
    [key: string]: unknown
  }
}

export async function fundingAdminRequest(
  path: string,
  init: RequestInit = {},
  requestId: string = crypto.randomUUID(),
): Promise<NextResponse> {
  if (SETTINGS_TOKEN.length < 32) {
    logger.error('funding_admin_unconfigured', { request_id: requestId, path })
    return NextResponse.json(
      {
        error: {
          code: 'FUNDING_ADMIN_NOT_CONFIGURED',
          message: 'Explorer funding administration is not configured',
        },
      },
      { status: 503, headers: { 'x-request-id': requestId } },
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const startedAt = Date.now()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('x-aeko-settings-token', SETTINGS_TOKEN)
  headers.set('x-request-id', requestId)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    const base = resolveAdminExplorerUrl().replace(/\/+$/, '')
    const response = await fetch(base + path, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    })
    const text = await response.text()
    let payload: ExplorerError & { data?: unknown }
    try {
      payload = JSON.parse(text) as ExplorerError & { data?: unknown }
    } catch {
      logger.error('funding_admin_invalid_upstream_response', {
        request_id: requestId,
        path,
        method: init.method ?? 'GET',
        status: response.status,
        latency_ms: Date.now() - startedAt,
      })
      return NextResponse.json(
        {
          error: {
            code: 'FUNDING_ADMIN_BAD_UPSTREAM',
            message: `Explorer funding API returned HTTP ${response.status} with non-JSON content`,
          },
        },
        { status: 502, headers: { 'x-request-id': requestId } },
      )
    }

    logger.info('funding_admin_request_completed', {
      request_id: requestId,
      path,
      method: init.method ?? 'GET',
      status: response.status,
      latency_ms: Date.now() - startedAt,
    })
    return NextResponse.json(payload, {
      status: response.status,
      headers: { 'x-request-id': requestId },
    })
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    logger.error(timedOut ? 'funding_admin_timeout' : 'funding_admin_unavailable', {
      request_id: requestId,
      path,
      method: init.method ?? 'GET',
      latency_ms: Date.now() - startedAt,
      error,
    })
    return NextResponse.json(
      {
        error: {
          code: timedOut ? 'FUNDING_ADMIN_TIMEOUT' : 'FUNDING_ADMIN_UNAVAILABLE',
          message: timedOut ? 'Explorer funding API timed out' : 'Explorer funding API is unavailable',
        },
      },
      { status: timedOut ? 504 : 503, headers: { 'x-request-id': requestId } },
    )
  } finally {
    clearTimeout(timer)
  }
}
