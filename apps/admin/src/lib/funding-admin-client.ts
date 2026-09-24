type FundingGatewayErrorBody = {
  error?: {
    code?: string
    message?: string
    [key: string]: unknown
  }
}

export class FundingGatewayError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

const DEFAULT_BASE = 'http://funding-gateway:3001'
const TIMEOUT_MS = 15_000

function baseUrl(): string {
  return (process.env.AEKO_INTERNAL_FUNDING_URL ?? DEFAULT_BASE).trim().replace(/\/+$/, '')
}

function adminKey(): string {
  const key = (process.env.FUNDING_ADMIN_API_KEY ?? '').trim()
  if (!key) throw new Error('FUNDING_ADMIN_API_KEY is required for Admin funding operations')
  return key
}

async function callFunding<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('x-aeko-funding-admin-key', adminKey())
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

    const response = await fetch(baseUrl() + path, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => ({}))) as FundingGatewayErrorBody & { data?: T }

    if (!response.ok || body.data === undefined) {
      const error = body.error ?? {}
      const details = { ...error }
      delete details.code
      delete details.message
      throw new FundingGatewayError(
        response.status,
        String(error.code ?? 'FUNDING_GATEWAY_ERROR'),
        String(error.message ?? `Funding Gateway request failed with HTTP ${response.status}`),
        details,
      )
    }

    return body.data
  } catch (err) {
    if (err instanceof FundingGatewayError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FundingGatewayError(504, 'FUNDING_GATEWAY_TIMEOUT', 'Funding Gateway request timed out')
    }
    throw new FundingGatewayError(
      502,
      'FUNDING_GATEWAY_UNAVAILABLE',
      err instanceof Error ? err.message : 'Funding Gateway is unavailable',
    )
  } finally {
    clearTimeout(timer)
  }
}

export type FundingSettings = {
  enabled: boolean
  amountAeko: number
  cooldownHours: number
  dailyBudgetAeko: number
  maxManualGrantAeko: number
}

export type FundingRequest = {
  id: string
  address: string
  amountAeko: number
  requestedAt: string
  source: 'public' | 'backend'
  status: 'pending' | 'processing' | 'approved' | 'rejected'
  decidedAt?: string
  signature?: string
  confirmed?: boolean
}

export type Grant = {
  address: string
  amountAeko: number
  signature: string
  at: string
  source: 'public' | 'backend' | 'admin' | 'console'
  confirmed: boolean
}

export const fundingAdminClient = {
  settings: () =>
    callFunding<{ settings: FundingSettings; dailyRemainingAeko: number }>('/api/internal/funding/settings'),
  updateSettings: (patch: Partial<FundingSettings>) =>
    callFunding<{ settings: FundingSettings }>('/api/internal/funding/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  requests: (limit: number) =>
    callFunding<FundingRequest[]>(`/api/internal/funding/requests?limit=${limit}`),
  decideRequest: (id: string, action: 'approve' | 'reject') =>
    callFunding<FundingRequest>('/api/internal/funding/requests', {
      method: 'POST',
      body: JSON.stringify({ id, action }),
    }),
  grants: (limit: number) =>
    callFunding<Grant[]>(`/api/internal/funding/grants?limit=${limit}`),
  grant: (address: string, amountAeko: number) =>
    callFunding<Grant>('/api/internal/funding/grants', {
      method: 'POST',
      body: JSON.stringify({ address, amountAeko }),
    }),
}
