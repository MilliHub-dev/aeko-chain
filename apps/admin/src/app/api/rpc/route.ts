import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminRpcUrl } from '../../../lib/network'
import { logger, requestIdFromHeaders } from '@/lib/logger'

const RPC_TIMEOUT_MS = 20_000

/**
 * Read-only RPC relay for the admin pages. Mutating funding flows go through
 * the authenticated Explorer control plane instead.
 */
const isReadOnly = (method: unknown) =>
  typeof method === 'string' && (method.startsWith('get') || method === 'simulateTransaction')

export async function POST(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    logger.warn('rpc_proxy_invalid_body', { request_id: requestId })
    return NextResponse.json(
      { error: { message: 'Invalid request body' } },
      { status: 400, headers: { 'x-request-id': requestId } },
    )
  }

  const b = body as { method?: string }
  if (!isReadOnly(b.method)) {
    logger.warn('rpc_proxy_method_rejected', { request_id: requestId, rpc_method: String(b.method ?? '') })
    return NextResponse.json(
      { error: { message: `Method not relayed: ${String(b.method)}. Use the Funding API for testnet grants.` } },
      { status: 403, headers: { 'x-request-id': requestId } },
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const res = await fetch(resolveAdminRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    })
    const data = await res.json()
    logger.info('rpc_proxy_completed', {
      request_id: requestId,
      rpc_method: b.method,
      status: res.status,
      latency_ms: Date.now() - startedAt,
    })
    return NextResponse.json(data, { status: res.status, headers: { 'x-request-id': requestId } })
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    logger.error(timedOut ? 'rpc_proxy_timeout' : 'rpc_proxy_failed', {
      request_id: requestId,
      rpc_method: b.method,
      latency_ms: Date.now() - startedAt,
      error,
    })
    return NextResponse.json(
      { error: { message: timedOut ? 'RPC request timed out' : 'RPC unreachable' } },
      { status: timedOut ? 504 : 503, headers: { 'x-request-id': requestId } },
    )
  } finally {
    clearTimeout(timer)
  }
}
