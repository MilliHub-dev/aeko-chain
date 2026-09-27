import { NextResponse } from 'next/server'
import { resolveAdminExplorerUrl } from './network'

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
): Promise<NextResponse> {
  if (SETTINGS_TOKEN.length < 32) {
    return NextResponse.json(
      {
        error: {
          code: 'FUNDING_ADMIN_NOT_CONFIGURED',
          message: 'Explorer funding administration is not configured',
        },
      },
      { status: 503 },
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('x-aeko-settings-token', SETTINGS_TOKEN)
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
      return NextResponse.json(
        {
          error: {
            code: 'FUNDING_ADMIN_BAD_UPSTREAM',
            message: `Explorer funding API returned HTTP ${response.status} with non-JSON content`,
          },
        },
        { status: 502 },
      )
    }

    return NextResponse.json(payload, { status: response.status })
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json(
      {
        error: {
          code: timedOut ? 'FUNDING_ADMIN_TIMEOUT' : 'FUNDING_ADMIN_UNAVAILABLE',
          message: timedOut
            ? 'Explorer funding API timed out'
            : error instanceof Error
              ? error.message
              : 'Explorer funding API is unavailable',
        },
      },
      { status: timedOut ? 504 : 503 },
    )
  } finally {
    clearTimeout(timer)
  }
}
