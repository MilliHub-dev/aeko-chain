import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminExplorerTimeoutMs, resolveAdminExplorerUrl } from '../../../../lib/network'
import { logger, requestIdFromHeaders } from '@/lib/logger'

const TIMEOUT_MS = resolveAdminExplorerTimeoutMs()

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const requestId = requestIdFromHeaders(req.headers)
  const explorerUrl = resolveAdminExplorerUrl()
  const subpath = '/' + params.path.join('/')
  const url = `${explorerUrl}${subpath}${req.nextUrl.search}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'x-request-id': requestId },
      signal: controller.signal,
    })
    const data = await res.json()
    logger.info('explorer_proxy_completed', {
      request_id: requestId,
      path: subpath,
      status: res.status,
      latency_ms: Date.now() - startedAt,
    })
    return NextResponse.json(data, { status: res.status, headers: { 'x-request-id': requestId } })
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    logger.error(timedOut ? 'explorer_proxy_timeout' : 'explorer_proxy_failed', {
      request_id: requestId,
      path: subpath,
      latency_ms: Date.now() - startedAt,
      error,
    })
    return NextResponse.json(
      { error: { message: timedOut ? 'Explorer request timed out' : 'Explorer unreachable' } },
      { status: timedOut ? 504 : 503, headers: { 'x-request-id': requestId } },
    )
  } finally {
    clearTimeout(timer)
  }
}
