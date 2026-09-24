import { randomUUID } from 'node:crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { isValidAddress } from './base58'
import { requestAirdrop, getSignatureStatuses } from './rpc'

/**
 * Testnet funding policy and grant ledger.
 *
 * The private Faucet Daemon only knows per-request and per-IP/time caps, and
 * every RPC-forwarded request reaches it from the validator's address, so the
 * per-wallet rules the operator wants (one grant per cooldown window, a daily
 * budget) have to live here. State is a JSON file on a persistent volume:
 * this is a single-process app and a testnet convenience, not a ledger of
 * record — the chain is.
 */

export type FundingSettings = {
  enabled: boolean
  /** Amount handed to a public request. */
  amountAeko: number
  /** Minimum hours between grants to the same wallet. */
  cooldownHours: number
  /** Total AEKO the public Funding Gateway may grant per UTC day. */
  dailyBudgetAeko: number
  /** Ceiling for an operator's manual grant. */
  maxManualGrantAeko: number
}

export type GrantSource = 'public' | 'backend' | 'admin' | 'console'

export type FundingRequestStatus = 'pending' | 'processing' | 'approved' | 'rejected'

export type FundingRequest = {
  id: string
  address: string
  amountAeko: number
  requestedAt: string
  source: 'public'
  status: FundingRequestStatus
  decidedAt?: string
  signature?: string
  confirmed?: boolean
}

export type Grant = {
  address: string
  amountAeko: number
  signature: string
  at: string
  source: GrantSource
  confirmed: boolean
}

type State = {
  settings: FundingSettings
  grants: Grant[]
  requests: FundingRequest[]
  lastGrantAt: Record<string, string>
  dayKey: string
  daySpentAeko: number
}

export class FundingError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

const DEFAULT_SETTINGS: FundingSettings = {
  enabled: true,
  amountAeko: Number(process.env.FUNDING_DEFAULT_AMOUNT_AEKO ?? 5),
  cooldownHours: Number(process.env.FUNDING_DEFAULT_COOLDOWN_HOURS ?? 24),
  dailyBudgetAeko: Number(process.env.FUNDING_DEFAULT_DAILY_BUDGET_AEKO ?? 5000),
  maxManualGrantAeko: Number(process.env.FUNDING_MAX_MANUAL_GRANT_AEKO ?? 100),
}

const MAX_GRANTS_KEPT = 500
const MAX_REQUESTS_KEPT = 500
const MAX_CONSOLE_AIRDROP_AEKO = Number(process.env.FUNDING_MAX_CONSOLE_AIRDROP_AEKO ?? 25)
const STATE_DIR = process.env.FUNDING_STATE_DIR ?? path.join(process.cwd(), 'data')
const STATE_FILE = path.join(STATE_DIR, 'funding-state.json')
const LEGACY_STATE_FILE = path.join(STATE_DIR, 'faucet-state.json')

const todayKey = () => new Date().toISOString().slice(0, 10)

let cached: State | null = null
// Serialises every read-modify-write; Node is single-threaded but awaits interleave.
let queue: Promise<unknown> = Promise.resolve()

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

async function readStateFile(): Promise<string | null> {
  for (const file of [STATE_FILE, LEGACY_STATE_FILE]) {
    try {
      return await fs.readFile(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
  return null
}

async function load(): Promise<State> {
  if (cached) return cached

  const persisted = await readStateFile()
  if (persisted === null) {
    cached = { settings: { ...DEFAULT_SETTINGS }, grants: [], requests: [], lastGrantAt: {}, dayKey: todayKey(), daySpentAeko: 0 }
    return cached
  }

  const raw = JSON.parse(persisted) as Partial<State>
  cached = {
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
    grants: Array.isArray(raw.grants) ? raw.grants : [],
    requests: Array.isArray(raw.requests) ? raw.requests : [],
    lastGrantAt: raw.lastGrantAt ?? {},
    dayKey: raw.dayKey ?? todayKey(),
    daySpentAeko: Number(raw.daySpentAeko ?? 0),
  }
  return cached
}

async function save(state: State): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true })
  const tmp = `${STATE_FILE}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(state, null, 2))
  await fs.rename(tmp, STATE_FILE)
  cached = state
}

function rollDay(state: State) {
  const key = todayKey()
  if (state.dayKey !== key) {
    state.dayKey = key
    state.daySpentAeko = 0
  }
}

export async function getSettings(): Promise<FundingSettings> {
  return { ...(await load()).settings }
}

export async function getPolicy() {
  const state = await load()
  rollDay(state)
  return {
    enabled: state.settings.enabled,
    amountAeko: state.settings.amountAeko,
    cooldownHours: state.settings.cooldownHours,
    dailyBudgetAeko: state.settings.dailyBudgetAeko,
    dailyRemainingAeko: Math.max(0, state.settings.dailyBudgetAeko - state.daySpentAeko),
  }
}

export async function updateSettings(patch: Partial<FundingSettings>): Promise<FundingSettings> {
  return withLock(async () => {
    const state = await load()
    const next = { ...state.settings }
    if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled
    for (const key of ['amountAeko', 'cooldownHours', 'dailyBudgetAeko', 'maxManualGrantAeko'] as const) {
      const value = patch[key]
      if (value === undefined) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new FundingError(400, 'INVALID_SETTING', `${key} must be a non-negative number`)
      }
      next[key] = value
    }
    if (next.amountAeko <= 0) throw new FundingError(400, 'INVALID_SETTING', 'amountAeko must be greater than 0')
    state.settings = next
    await save(state)
    return { ...next }
  })
}

export async function listGrants(limit = 100): Promise<Grant[]> {
  return (await load()).grants.slice(0, limit)
}

export async function listFundingRequests(limit = 100): Promise<FundingRequest[]> {
  return (await load()).requests.slice(0, limit)
}

function cooldownWaitSeconds(state: State, address: string): number {
  const last = state.lastGrantAt[address]
  if (!last) return 0
  const nextAt = new Date(last).getTime() + state.settings.cooldownHours * 3_600_000
  return Math.max(0, Math.ceil((nextAt - Date.now()) / 1000))
}

export async function requestFundingApproval(address: string): Promise<FundingRequest> {
  if (!isValidAddress(address)) {
    throw new FundingError(400, 'INVALID_ADDRESS', 'Enter a valid AEKO wallet address')
  }

  return withLock(async () => {
    const state = await load()
    rollDay(state)
    if (!state.settings.enabled) {
      throw new FundingError(503, 'FUNDING_DISABLED', 'Testnet funding is paused right now. Try again later.')
    }

    const wait = cooldownWaitSeconds(state, address)
    if (wait > 0) {
      throw new FundingError(
        429,
        'COOLDOWN',
        `This wallet already received test AEKO. Try again in ${formatWait(wait)}.`,
        { retryAfterSeconds: wait },
      )
    }

    const pending = state.requests.find(
      (request) => request.address === address && ['pending', 'processing'].includes(request.status),
    )
    if (pending) {
      throw new FundingError(
        409,
        'REQUEST_PENDING',
        'This wallet already has a funding request waiting for an operator decision.',
        { requestId: pending.id },
      )
    }

    if (state.daySpentAeko + state.settings.amountAeko > state.settings.dailyBudgetAeko) {
      throw new FundingError(429, 'BUDGET_EXHAUSTED', "Today's testnet funding budget is used up. Try again tomorrow.")
    }

    const request: FundingRequest = {
      id: randomUUID(),
      address,
      amountAeko: state.settings.amountAeko,
      requestedAt: new Date().toISOString(),
      source: 'public',
      status: 'pending',
    }
    state.requests.unshift(request)
    if (state.requests.length > MAX_REQUESTS_KEPT) state.requests.length = MAX_REQUESTS_KEPT
    await save(state)
    return { ...request }
  })
}

export async function decideFundingRequest(
  id: string,
  action: 'approve' | 'reject',
): Promise<FundingRequest> {
  if (!id.trim()) throw new FundingError(400, 'INVALID_REQUEST_ID', 'Funding request id is required')

  if (action === 'reject') {
    return withLock(async () => {
      const state = await load()
      const request = state.requests.find((entry) => entry.id === id)
      if (!request) throw new FundingError(404, 'REQUEST_NOT_FOUND', 'Funding request not found')
      if (request.status !== 'pending') {
        throw new FundingError(409, 'REQUEST_ALREADY_DECIDED', `Funding request is already ${request.status}`)
      }
      request.status = 'rejected'
      request.decidedAt = new Date().toISOString()
      await save(state)
      return { ...request }
    })
  }

  const reserved = await withLock(async () => {
    const state = await load()
    rollDay(state)
    const request = state.requests.find((entry) => entry.id === id)
    if (!request) throw new FundingError(404, 'REQUEST_NOT_FOUND', 'Funding request not found')
    if (request.status !== 'pending') {
      throw new FundingError(409, 'REQUEST_ALREADY_DECIDED', `Funding request is already ${request.status}`)
    }

    const wait = cooldownWaitSeconds(state, request.address)
    if (wait > 0) {
      throw new FundingError(
        429,
        'COOLDOWN',
        `This wallet already received test AEKO. Try again in ${formatWait(wait)}.`,
        { retryAfterSeconds: wait },
      )
    }
    if (state.daySpentAeko + request.amountAeko > state.settings.dailyBudgetAeko) {
      throw new FundingError(429, 'BUDGET_EXHAUSTED', "Today's testnet funding budget is used up. Try again tomorrow.")
    }

    const reservedAt = new Date().toISOString()
    request.status = 'processing'
    state.daySpentAeko += request.amountAeko
    state.lastGrantAt[request.address] = reservedAt
    await save(state)
    return { request: { ...request }, reservedAt }
  })

  let signature: string
  try {
    signature = await requestAirdrop(
      reserved.request.address,
      Math.round(reserved.request.amountAeko * 1_000_000_000),
    )
  } catch (err) {
    await withLock(async () => {
      const state = await load()
      rollDay(state)
      const request = state.requests.find((entry) => entry.id === id)
      if (request?.status === 'processing') request.status = 'pending'
      state.daySpentAeko = Math.max(0, state.daySpentAeko - reserved.request.amountAeko)
      if (state.lastGrantAt[reserved.request.address] === reserved.reservedAt) {
        delete state.lastGrantAt[reserved.request.address]
      }
      await save(state)
    })
    const message = err instanceof Error ? err.message : 'low-level funding transfer failed'
    throw new FundingError(
      502,
      'FUNDING_TRANSFER_FAILED',
      `The private Faucet Daemon rejected the approved funding transfer: ${message}`,
    )
  }

  const confirmed = await waitForConfirmation(signature)
  return withLock(async () => {
    const state = await load()
    const request = state.requests.find((entry) => entry.id === id)
    if (!request) throw new FundingError(404, 'REQUEST_NOT_FOUND', 'Funding request not found after approval')
    request.status = 'approved'
    request.decidedAt = new Date().toISOString()
    request.signature = signature
    request.confirmed = confirmed

    const record: Grant = {
      address: request.address,
      amountAeko: request.amountAeko,
      signature,
      at: request.decidedAt,
      source: request.source,
      confirmed,
    }
    state.grants.unshift(record)
    if (state.grants.length > MAX_GRANTS_KEPT) state.grants.length = MAX_GRANTS_KEPT
    await save(state)
    return { ...request }
  })
}

/** Polls briefly so the caller can say "landed" rather than "submitted". */
async function waitForConfirmation(signature: string): Promise<boolean> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const status = await getSignatureStatuses([signature])
      const s = status.value[0]
      if (s?.err) return false
      if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return true
    } catch {
      // Keep polling; a transient RPC error shouldn't fail a submitted grant.
    }
  }
  return false
}

/**
 * Grants AEKO to `address` under the current policy.
 *
 * `admin` grants choose their own amount and skip cooldown and budget; the
 * `backend` source is the Aeko app calling on a user's behalf and follows the
 * public rules (the app's IP is shared, which is why IP limits are not here).
 */
export async function grant(input: {
  address: string
  source: GrantSource
  amountAeko?: number
}): Promise<Grant & { retryAfterSeconds?: undefined }> {
  if (!isValidAddress(input.address)) {
    throw new FundingError(400, 'INVALID_ADDRESS', 'Enter a valid AEKO wallet address')
  }

  const reserved = await withLock(async () => {
    const state = await load()
    rollDay(state)
    const { settings } = state
    const customAmount = input.source === 'admin' || input.source === 'console'

    let amountAeko = settings.amountAeko
    if (customAmount) {
      amountAeko = Number(input.amountAeko)
      if (!Number.isFinite(amountAeko) || amountAeko <= 0) {
        throw new FundingError(400, 'INVALID_AMOUNT', 'Amount must be greater than 0')
      }
      const cap = input.source === 'console' ? MAX_CONSOLE_AIRDROP_AEKO : settings.maxManualGrantAeko
      if (amountAeko > cap) {
        const label = input.source === 'console' ? 'Test Console airdrops' : 'Manual grants'
        throw new FundingError(400, 'AMOUNT_TOO_LARGE', `${label} are capped at ${cap} AEKO`)
      }
    } else {
      if (!settings.enabled) {
        throw new FundingError(503, 'FUNDING_DISABLED', 'Testnet funding is paused right now. Try again later.')
      }
      const last = state.lastGrantAt[input.address]
      if (last) {
        const nextAt = new Date(last).getTime() + settings.cooldownHours * 3_600_000
        const wait = Math.ceil((nextAt - Date.now()) / 1000)
        if (wait > 0) {
          throw new FundingError(429, 'COOLDOWN', `This wallet already received test AEKO. Try again in ${formatWait(wait)}.`, {
            retryAfterSeconds: wait,
          })
        }
      }
      if (state.daySpentAeko + amountAeko > settings.dailyBudgetAeko) {
        throw new FundingError(429, 'BUDGET_EXHAUSTED', "Today's testnet funding budget is used up. Try again tomorrow.")
      }
      // Reserve the budget before the RPC call so concurrent requests can't
      // all pass the check; released below if the airdrop fails.
      state.daySpentAeko += amountAeko
      state.lastGrantAt[input.address] = new Date().toISOString()
      await save(state)
    }
    return amountAeko
  })

  let signature: string
  try {
    signature = await requestAirdrop(input.address, Math.round(reserved * 1_000_000_000))
  } catch (err) {
    if (input.source !== 'admin' && input.source !== 'console') {
      await withLock(async () => {
        const state = await load()
        rollDay(state)
        state.daySpentAeko = Math.max(0, state.daySpentAeko - reserved)
        delete state.lastGrantAt[input.address]
        await save(state)
      })
    }
    const message = err instanceof Error ? err.message : 'low-level funding transfer failed'
    throw new FundingError(502, 'FUNDING_TRANSFER_FAILED', `The private Faucet Daemon rejected the low-level funding transfer: ${message}`)
  }

  const confirmed = await waitForConfirmation(signature)
  const record: Grant = {
    address: input.address,
    amountAeko: reserved,
    signature,
    at: new Date().toISOString(),
    source: input.source,
    confirmed,
  }
  await withLock(async () => {
    const state = await load()
    state.grants.unshift(record)
    if (state.grants.length > MAX_GRANTS_KEPT) state.grants.length = MAX_GRANTS_KEPT
    await save(state)
  })
  return record
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`
  return `${Math.ceil(seconds / 3600)} h`
}
