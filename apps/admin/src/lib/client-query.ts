export class ClientApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ClientApiError'
    this.status = status
    this.code = code
  }
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!payload) {
    throw new ClientApiError(
      `Operations API returned HTTP ${response.status} without JSON`,
      response.status,
    )
  }
  if (!response.ok) {
    throw new ClientApiError(
      payload?.error?.message ?? `Operations API request failed with HTTP ${response.status}`,
      response.status,
      payload?.error?.code,
    )
  }
  return payload
}

export async function operationQuery<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store',
    ...init,
  })
  const payload = await readJson(response)
  return payload.data as T
}

export async function explorerQuery<T>(path: string): Promise<T> {
  return operationQuery<T>('/api/explorer' + path)
}

export async function rpcQuery<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch('/api/rpc', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const payload = await readJson(response)
  if (payload.error) {
    throw new ClientApiError(
      payload.error.message ?? `RPC ${method} failed`,
      response.status,
      payload.error.code,
    )
  }
  return payload.result as T
}

export const adminQueryKeys = {
  dashboard: ['admin', 'dashboard'] as const,
  blocks: ['admin', 'blocks'] as const,
  transactions: ['admin', 'transactions'] as const,
  tokens: ['admin', 'tokens'] as const,
  nfts: ['admin', 'nfts'] as const,
  marketplace: ['admin', 'marketplace'] as const,
  social: ['admin', 'social'] as const,
  protocol: ['admin', 'protocol'] as const,
  settings: ['admin', 'settings'] as const,
  account: (address: string) => ['admin', 'account', address] as const,
  transaction: (signature: string) => ['admin', 'transaction', signature] as const,
}
