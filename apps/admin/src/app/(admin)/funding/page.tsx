'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccountLink, TransactionLink } from '@/components/chain-links'
import DataTable from '@/components/data-table'
import FeedbackAlert from '@/components/feedback-alert'
import SectionTabs from '@/components/section-tabs'
import StatCard from '@/components/stat-card'
import { useToaster } from '@/components/toaster'

type Settings = {
  enabled: boolean
  amountAeko: number
  cooldownHours: number
  dailyBudgetAeko: number
  maxAdminFundingAeko: number
  consoleAirdropCapAeko: number
  revision: number
  updatedAt: string
}

type FundingSnapshot = {
  network: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
  mode: 'funding'
  settings: Settings | null
  dailyRemainingAeko: number | null
  publicSpentAeko: number | null
  publicReservedAeko: number | null
  consoleAirdropAggregateUnlimited: boolean
  developerAirdropEnabled: boolean
  faucetPerRequestCapAeko: number | null
}

type FundingTransfer = {
  id: string
  requestId?: string | null
  address: string
  amountAeko: number
  signature?: string | null
  fundedAt: string
  source: string
  confirmed: boolean
}

type FundingRequest = {
  id: string
  address: string
  amountAeko: number
  requestedAt: string
  source: string
  status: 'pending' | 'processing' | 'submitted' | 'confirmed' | 'failed' | 'rejected'
  decidedAt?: string | null
  submittedAt?: string | null
  confirmedAt?: string | null
  signature?: string | null
  confirmed: boolean
  errorCode?: string | null
}

type Airdrop = {
  id: string
  address: string
  amountAeko: number
  signature?: string | null
  status: 'processing' | 'submitted' | 'confirmed' | 'failed'
  requestedAt: string
  submittedAt?: string | null
  confirmedAt?: string | null
  errorCode?: string | null
}

type FundingView = 'queue' | 'policy' | 'history' | 'airdrops'

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-[#1e2135] bg-[#0d0e16] px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 mono'

const friendlyMessages: Record<string, string> = {
  FUNDING_SUBMISSION_RETRY_PENDING: 'Funding submission is retrying safely. No duplicate transfer will be created.',
  FUNDING_CONFIRMATION_PENDING: 'Funding was submitted and is awaiting chain confirmation.',
  AIRDROP_SUBMISSION_RETRY_PENDING: 'Developer airdrop is retrying safely. No duplicate airdrop will be created.',
  AIRDROP_CONFIRMATION_PENDING: 'Developer airdrop was submitted and is awaiting chain confirmation.',
  AIRDROP_DISABLED_ON_MAINNET: 'Developer airdrop is disabled on Mainnet.',
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!payload) {
    throw Object.assign(
      new Error(`Funding control plane returned HTTP ${response.status} without JSON`),
      { status: response.status },
    )
  }
  if (!response.ok) {
    const code = String(payload.error?.code ?? '')
    const friendly = friendlyMessages[code]
    throw Object.assign(
      new Error(friendly ?? payload.error?.message ?? `Funding request failed with HTTP ${response.status}`),
      { status: response.status, code },
    )
  }
  return payload
}

const fundingKeys = {
  all: ['admin', 'funding'] as const,
  settings: ['admin', 'funding', 'settings'] as const,
  history: ['admin', 'funding', 'history'] as const,
  airdrops: ['admin', 'funding', 'airdrops'] as const,
  requests: ['admin', 'funding', 'requests'] as const,
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function airdropStateDetail(airdrop: Airdrop) {
  switch (airdrop.errorCode) {
    case 'AIRDROP_SUBMISSION_RETRY_PENDING':
      return 'Retrying safely'
    case 'AIRDROP_CONFIRMATION_PENDING':
      return 'Awaiting confirmation'
    case 'AIRDROP_CONFIRMATION_UNAVAILABLE':
      return 'Confirmation temporarily unavailable'
    case 'AIRDROP_BLOCKHASH_UNAVAILABLE':
      return 'Network blockhash unavailable'
    case 'AIRDROP_TRANSACTION_FAILED':
      return 'Transfer failed'
    default:
      return airdrop.errorCode ? 'Needs attention' : '—'
  }
}

export default function FundingPage() {
  const [draft, setDraft] = useState<Settings | null>(null)
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('10')
  const [view, setView] = useState<FundingView>('queue')
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const directFundingIntentRef = useRef<{
    recipient: string
    amountAeko: number
    requestId: string
  } | null>(null)
  const queryClient = useQueryClient()
  const toast = useToaster()

  const snapshotQuery = useQuery({
    queryKey: fundingKeys.settings,
    queryFn: async () => {
      const payload = await readJson(
        await fetch('/api/admin/funding/settings', { cache: 'no-store' }),
      )
      return payload.data as FundingSnapshot
    },
    refetchInterval: 30_000,
  })

  const snapshot = snapshotQuery.data ?? null
  const settings = snapshot?.settings ?? null
  const isFundingAvailable = snapshot?.mode === 'funding'

  const historyQuery = useQuery({
    queryKey: fundingKeys.history,
    queryFn: async () => {
      const payload = await readJson(
        await fetch('/api/admin/funding/history?limit=100', { cache: 'no-store' }),
      )
      return (payload.data ?? []) as FundingTransfer[]
    },
    enabled: isFundingAvailable,
    refetchInterval: 15_000,
  })

  const airdropsQuery = useQuery({
    queryKey: fundingKeys.airdrops,
    queryFn: async () => {
      const payload = await readJson(
        await fetch('/api/admin/funding/airdrops?limit=100', { cache: 'no-store' }),
      )
      return (payload.data ?? []) as Airdrop[]
    },
    enabled: isFundingAvailable,
    refetchInterval: 15_000,
  })

  const requestsQuery = useQuery({
    queryKey: fundingKeys.requests,
    queryFn: async () => {
      const payload = await readJson(
        await fetch('/api/admin/funding/requests?limit=100', { cache: 'no-store' }),
      )
      return (payload.data ?? []) as FundingRequest[]
    },
    enabled: isFundingAvailable,
    refetchInterval: 5_000,
  })

  const fundingHistory = historyQuery.data ?? []
  const airdrops = airdropsQuery.data ?? []
  const requests = requestsQuery.data ?? []
  const selectedRequest = selectedRequestId
    ? requests.find((request) => request.id === selectedRequestId) ?? null
    : null
  const closeRequestDetail = useCallback(() => setSelectedRequestId(null), [])

  useEffect(() => {
    if (!settings) {
      setDraft(null)
      return
    }
    setDraft((current) => {
      if (!current || current.revision !== settings.revision) return settings
      return current
    })
  }, [settings])

  const invalidateFunding = () =>
    queryClient.invalidateQueries({ queryKey: fundingKeys.all })

  const settingsMutation = useMutation({
    retry: false,
    mutationFn: async (body: Record<string, unknown>) => {
      const payload = await readJson(
        await fetch('/api/admin/funding/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
      return payload.data as FundingSnapshot
    },
  })

  const decisionMutation = useMutation({
    retry: false,
    mutationFn: async ({
      id,
      action,
    }: {
      id: string
      action: 'approve' | 'reject' | 'reconcile'
    }) => {
      const payload = await readJson(
        await fetch('/api/admin/funding/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action }),
        }),
      )
      return payload.data as FundingRequest
    },
  })

  const directFundingMutation = useMutation({
    retry: false,
    mutationFn: async ({
      recipient,
      amountAeko,
      requestId,
    }: {
      recipient: string
      amountAeko: number
      requestId: string
    }) => {
      const payload = await readJson(
        await fetch('/api/admin/funding/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId,
          },
          body: JSON.stringify({ address: recipient, amountAeko }),
        }),
      )
      return payload.data as FundingRequest
    },
  })

  async function refresh() {
    const work: Array<Promise<unknown>> = [snapshotQuery.refetch()]
    if (isFundingAvailable) {
      work.push(historyQuery.refetch(), airdropsQuery.refetch(), requestsQuery.refetch())
    }
    await Promise.all(work)
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || !settings || !isFundingAvailable) return

    try {
      const next = await settingsMutation.mutateAsync({
        expectedRevision: settings.revision,
        enabled: draft.enabled,
        amountAeko: draft.amountAeko,
        cooldownHours: draft.cooldownHours,
        dailyBudgetAeko: draft.dailyBudgetAeko,
        maxAdminFundingAeko: draft.maxAdminFundingAeko,
        consoleAirdropCapAeko: draft.consoleAirdropCapAeko,
      })
      queryClient.setQueryData(fundingKeys.settings, next)
      if (next.settings) setDraft(next.settings)
      toast.success('Funding policy saved.', { title: 'Policy updated' })
      await invalidateFunding()
    } catch (error) {
      toast.error(messageFrom(error, 'Save failed'), { title: 'Policy update failed' })
    }
  }

  async function toggleEnabled() {
    if (!settings || !isFundingAvailable) return
    const nextEnabled = !settings.enabled

    try {
      const next = await settingsMutation.mutateAsync({
        expectedRevision: settings.revision,
        enabled: nextEnabled,
      })
      queryClient.setQueryData(fundingKeys.settings, next)
      if (next.settings) setDraft(next.settings)
      toast.success(
        nextEnabled ? 'Public funding resumed.' : 'Public funding paused.',
        { title: 'Funding policy updated' },
      )
      await invalidateFunding()
    } catch (error) {
      toast.error(messageFrom(error, 'Policy update failed'), {
        title: 'Funding policy update failed',
      })
    }
  }

  async function decideRequest(
    id: string,
    action: 'approve' | 'reject' | 'reconcile',
  ) {
    try {
      const request = await decisionMutation.mutateAsync({ id, action })
      if (action === 'reject') {
        toast.success('Funding request rejected.', { title: 'Request updated' })
      } else if (request.status === 'confirmed') {
        toast.success(
          `Funding confirmed: ${request.amountAeko} AEKO to ${request.address}`,
          { title: 'Funding confirmed' },
        )
      } else {
        toast.info(
          `Funding is ${request.status}; no duplicate transfer will be submitted while confirmation is unresolved.`,
          { title: 'Settlement submitted' },
        )
      }
      await invalidateFunding()
    } catch (error) {
      toast.error(messageFrom(error, `Funding request ${action} failed`), {
        title: 'Funding action failed',
      })
    }
  }

  async function sendFunding(e: React.FormEvent) {
    e.preventDefault()
    if (!isFundingAvailable) return

    const recipient = address.trim()
    const amountAeko = Number(amount)
    const existingIntent = directFundingIntentRef.current
    const intent =
      existingIntent &&
      existingIntent.recipient === recipient &&
      existingIntent.amountAeko === amountAeko
        ? existingIntent
        : {
            recipient,
            amountAeko,
            requestId: crypto.randomUUID(),
          }
    directFundingIntentRef.current = intent

    try {
      const funding = await directFundingMutation.mutateAsync(intent)
      directFundingIntentRef.current = null
      const signature = String(funding.signature ?? '')
      const message = `Sent ${funding.amountAeko} AEKO — ${funding.confirmed ? 'confirmed' : 'submitted'}${signature ? ` (${signature.slice(0, 16)}…)` : ''}`
      if (funding.confirmed) {
        toast.success(message, { title: 'Funding confirmed' })
      } else {
        toast.info(message, { title: 'Funding submitted' })
      }
      setAddress('')
      await invalidateFunding()
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : Number.NaN
      if (Number.isFinite(status) && status < 500) {
        directFundingIntentRef.current = null
      }
      await invalidateFunding()
      toast.error(messageFrom(error, 'Funding send failed'), { title: 'Funding send failed' })
    }
  }

  const requestBusy = decisionMutation.isPending
    ? decisionMutation.variables?.id ?? ''
    : ''
  const busy = settingsMutation.isPending || directFundingMutation.isPending
  const syncing =
    snapshotQuery.isFetching
    || historyQuery.isFetching
    || airdropsQuery.isFetching
    || requestsQuery.isFetching
  const syncError = [
    snapshotQuery.error,
    historyQuery.error,
    airdropsQuery.error,
    requestsQuery.error,
  ].find(Boolean)
  const syncErrorMessage = syncError
    ? messageFrom(syncError, 'Funding control plane is unavailable')
    : ''
  const lastSyncedTimestamp = Math.max(
    snapshotQuery.dataUpdatedAt,
    historyQuery.dataUpdatedAt,
    airdropsQuery.dataUpdatedAt,
    requestsQuery.dataUpdatedAt,
  )
  const lastSyncedAt = lastSyncedTimestamp ? new Date(lastSyncedTimestamp) : null

  const field = (key: keyof Pick<Settings, 'amountAeko' | 'cooldownHours' | 'dailyBudgetAeko' | 'maxAdminFundingAeko' | 'consoleAirdropCapAeko'>, label: string, step = '1') =>
    draft && (
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">{label}</label>
        <input
          type="number"
          min="0"
          step={step}
          value={String(draft[key])}
          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
          className={inputClass}
        />
      </div>
    )

  const attentionRequests = requests.filter((request) =>
    ['pending', 'processing', 'submitted', 'failed'].includes(request.status),
  )

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-3 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-emerald-400">Funding operations</div>
          <h1 className="mt-1 text-2xl font-bold text-white">Funding & developer airdrops</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            {!snapshot
              ? 'Loading the live funding policy and settlement state for this network.'
              : 'Review public funding requests, maintain network policy, and send Admin funding directly, and keep developer airdrops as a separate test utility.'}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div
            className={
              'flex min-h-[44px] items-center justify-between gap-3 rounded-xl border px-3 text-xs sm:justify-start ' +
              (syncErrorMessage
                ? 'border-red-400/25 bg-red-400/10 text-red-100'
                : 'border-[#1e2135] bg-[#12141f] text-gray-400')
            }
          >
            <span className={'size-2 rounded-full ' + (syncErrorMessage ? 'bg-red-400' : lastSyncedAt ? 'bg-emerald-400' : 'bg-gray-600')} />
            <span>
              {syncErrorMessage
                ? 'Sync interrupted'
                : lastSyncedAt
                  ? 'Synced ' + lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Waiting for sync'}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={syncing}
              className="rounded-md px-2 py-1 font-semibold text-gray-200 transition-colors hover:bg-white/5 disabled:opacity-40"
            >
              {syncing ? 'Syncing…' : 'Refresh'}
            </button>
          </div>
          {isFundingAvailable && settings ? (
            <button
              type="button"
              onClick={toggleEnabled}
              disabled={busy}
              className={
                'min-h-[44px] w-full rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-40 sm:w-auto ' +
                (settings.enabled
                  ? 'border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15'
                  : 'bg-emerald-400 text-black hover:bg-emerald-300')
              }
            >
              {settings.enabled ? 'Pause public funding' : 'Resume public funding'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6 2xl:gap-4">
        <StatCard
          label="Network"
          value={snapshot?.network ?? '—'}
          accent={Boolean(snapshot)}
        />
        <StatCard
          label="Public funding"
          value={isFundingAvailable && settings ? (settings.enabled ? 'Open' : 'Paused') : snapshot ? 'Unavailable' : '—'}
          accent={isFundingAvailable ? settings?.enabled : undefined}
        />
        <StatCard label="Per request" value={isFundingAvailable && settings ? `${settings.amountAeko} AEKO` : '—'} />
        <StatCard
          label="Left today"
          value={isFundingAvailable && snapshot?.dailyRemainingAeko !== null && snapshot?.dailyRemainingAeko !== undefined
            ? `${snapshot.dailyRemainingAeko.toLocaleString()} AEKO`
            : '—'}
          sub={isFundingAvailable && settings ? `of ${settings.dailyBudgetAeko.toLocaleString()}` : undefined}
        />
        <StatCard label="Needs attention" value={isFundingAvailable ? attentionRequests.length : '—'} />
        <StatCard label="Funding history" value={isFundingAvailable ? fundingHistory.length : '—'} />
      </div>

      {isFundingAvailable ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Public spent today</div>
            <div className="mt-1 text-sm font-semibold text-white">{snapshot?.publicSpentAeko?.toLocaleString() ?? '0'} AEKO</div>
          </div>
          <div className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Public budget reserved</div>
            <div className="mt-1 text-sm font-semibold text-white">{snapshot?.publicReservedAeko?.toLocaleString() ?? '0'} AEKO</div>
          </div>
          <div className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Developer airdrop aggregate</div>
            <div className="mt-1 text-sm font-semibold text-emerald-300">
              {snapshot?.developerAirdropEnabled ? (snapshot.consoleAirdropAggregateUnlimited ? 'No daily allocation ceiling' : 'Policy limited') : 'Disabled on Mainnet'}
            </div>
          </div>
          <div className="rounded-xl border border-[#1e2135] bg-[#12141f] p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Faucet hard cap</div>
            <div className="mt-1 text-sm font-semibold text-white">{snapshot?.faucetPerRequestCapAeko ?? '—'} AEKO / request</div>
          </div>
        </div>
      ) : null}

      {syncErrorMessage ? (
        <FeedbackAlert
          tone="error"
          title="Live funding data could not refresh"
          action={
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={syncing}
              className="min-h-[40px] rounded-lg border border-red-300/25 px-3 text-xs font-semibold transition-colors hover:bg-red-300/10 disabled:opacity-40"
            >
              {syncing ? 'Retrying…' : 'Retry sync'}
            </button>
          }
        >
          {syncErrorMessage}
        </FeedbackAlert>
      ) : null}

      {isFundingAvailable ? (
        <>
          <SectionTabs
            label="Funding administration sections"
            value={view}
            onChange={setView}
            items={[
              { value: 'queue', label: 'Funding requests', description: 'Admin decisions and submitted funding reconciliation', count: attentionRequests.length },
              { value: 'policy', label: 'Policy & direct funding', description: 'Public limits and Admin direct funding' },
              { value: 'history', label: 'Funding history', description: 'Confirmed public and Admin funding', count: fundingHistory.length },
              { value: 'airdrops', label: 'Airdrop history', description: 'Developer Test Console airdrops', count: airdrops.length },
            ]}
          />

          {view === 'queue' ? (
            <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-semibold text-white">Requests requiring attention</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Approval atomically re-checks wallet cooldown and the public daily budget before protected Validator/Faucet settlement.
                  </p>
                </div>
                <div className="text-xs text-gray-600">{attentionRequests.length} request{attentionRequests.length === 1 ? '' : 's'} requiring attention</div>
              </div>
              <DataTable
                alwaysShowPagination
                paginationLabel="requests"
                columns={['Requested', 'Address', 'Amount', 'Source', 'Status', 'Review']}
                rows={attentionRequests.map((request) => [
                  new Date(request.requestedAt).toLocaleString(),
                  <AccountLink key={request.id + '-address'} address={request.address} />,
                  `${request.amountAeko} AEKO`,
                  request.source,
                  <span
                    key={`${request.id}-status`}
                    className={
                      request.status === 'failed'
                        ? 'text-red-300'
                        : request.status === 'pending'
                          ? 'text-emerald-300'
                          : 'text-yellow-300'
                    }
                  >
                    {request.status}
                  </span>,
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => setSelectedRequestId(request.id)}
                    className="min-h-[40px] rounded-lg border border-[#2b3048] px-3 text-xs font-semibold text-gray-200 transition-colors hover:border-emerald-400/40 hover:text-white"
                  >
                    View details
                  </button>,
                ])}
                empty="No public funding requests need attention"
              />
            </section>
          ) : null}

          {view === 'policy' ? (
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              <form onSubmit={saveSettings} className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:p-6">
                <div className="mb-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">Public funding policy</div>
                  <h2 className="mt-1 font-semibold text-white">Approval limits</h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    The public queue has a request amount, wallet cooldown, and daily allocation. Direct developer airdrops do not consume that aggregate allocation; they remain bounded by the Test Console and Faucet per-request caps.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('amountAeko', 'Amount per public request (AEKO)', '0.1')}
                  {field('cooldownHours', 'Public wallet cooldown (hours)', '0.1')}
                  {field('dailyBudgetAeko', 'Public daily allocation (AEKO)', '0.1')}
                  {field('maxAdminFundingAeko', 'Max Admin funding send (AEKO)', '0.1')}
                  {field('consoleAirdropCapAeko', 'Developer airdrop cap / request (AEKO)', '0.1')}
                </div>
                <div className="mt-4 text-xs text-gray-600">
                  Policy revision {settings?.revision ?? '—'} · updated {settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString() : '—'}
                </div>
                <button type="submit" disabled={settingsMutation.isPending || !draft} className="mt-5 min-h-[44px] rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                  {settingsMutation.isPending ? 'Saving…' : 'Save policy'}
                </button>
              </form>

              <form onSubmit={sendFunding} className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:p-6">
                <div className="mb-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-300">Operator action</div>
                  <h2 className="mt-1 font-semibold text-white">Direct Admin funding</h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    Sends AEKO directly to the recipient without a second approval step. The Admin funding cap and Faucet hard cap still apply.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Recipient address</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Base58 wallet address…" required className={inputClass} />
                </div>
                <div className="mt-4">
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Amount (AEKO)</label>
                  <div className="flex flex-wrap gap-2">
                    <input type="number" min="0.001" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} required className={`${inputClass} sm:w-40`} />
                    {[1, 10, 50].map((value) => (
                      <button key={value} type="button" onClick={() => setAmount(String(value))} className="min-h-[44px] rounded-lg border border-[#2b3048] px-3 text-xs text-gray-300 transition-colors hover:border-emerald-500/50 hover:text-white">
                        {value} AEKO
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={directFundingMutation.isPending || !address} className="mt-5 min-h-[44px] rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                  {directFundingMutation.isPending ? 'Sending…' : 'Send funding'}
                </button>
              </form>
            </div>
          ) : null}

          {view === 'airdrops' ? (
            <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-white">Developer Test Console airdrops</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Developer airdrops are separate from public funding requests. They are disabled on Mainnet and remain rate-limited, capped per request, and durably tracked on test environments.
                </p>
              </div>
              <DataTable
                alwaysShowPagination
                paginationLabel="airdrops"
                columns={['Requested', 'Address', 'Amount', 'Status', 'Signature', 'Error']}
                rows={airdrops.map((airdrop) => [
                  new Date(airdrop.requestedAt).toLocaleString(),
                  <AccountLink key={airdrop.id + '-address'} address={airdrop.address} />,
                  `${airdrop.amountAeko} AEKO`,
                  <span
                    key={airdrop.id}
                    className={
                      airdrop.status === 'confirmed'
                        ? 'text-emerald-300'
                        : airdrop.status === 'failed'
                          ? 'text-red-300'
                          : 'text-yellow-300'
                    }
                  >
                    {airdrop.status}
                  </span>,
                  airdrop.signature ? <TransactionLink key={airdrop.id + '-signature'} signature={airdrop.signature} /> : '—',
                  airdropStateDetail(airdrop),
                ])}
                empty="No developer airdrops have been requested yet"
              />
            </section>
          ) : null}

          {view === 'history' ? (
            <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-white">Confirmed funding</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Confirmed public requests and direct Admin funding appear here. Developer airdrops remain deliberately separate.
                </p>
              </div>
              <DataTable
                alwaysShowPagination
                paginationLabel="funding history"
                columns={['When', 'Address', 'Amount', 'Source', 'Status', 'Signature']}
                rows={fundingHistory.map((funding) => [
                  new Date(funding.fundedAt).toLocaleString(),
                  <AccountLink key={funding.id + '-address'} address={funding.address} />,
                  `${funding.amountAeko} AEKO`,
                  funding.source,
                  <span key={funding.id} className={funding.confirmed ? 'text-emerald-300' : 'text-yellow-300'}>{funding.confirmed ? 'confirmed' : 'submitted'}</span>,
                  funding.signature ? <TransactionLink key={funding.id + '-signature'} signature={funding.signature} /> : '—',
                ])}
                empty="No confirmed funding transfers yet"
              />
            </section>
          ) : null}
        </>
      ) : null}
      <FundingDecisionAlert
        request={selectedRequest}
        busy={requestBusy === selectedRequest?.id}
        onClose={closeRequestDetail}
        onDecision={decideRequest}
      />
    </div>
  )
}

function FundingDecisionAlert({
  request,
  busy,
  onClose,
  onDecision,
}: {
  request: FundingRequest | null
  busy: boolean
  onClose: () => void
  onDecision: (id: string, action: 'approve' | 'reject' | 'reconcile') => Promise<void>
}) {
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(busy)
  const requestId = request?.id ?? null

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    if (!requestId) return

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    closeButtonRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [onClose, requestId])

  if (!request) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="funding-request-title"
        aria-describedby="funding-request-description"
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#2b3048] bg-[#12141f] shadow-2xl shadow-black/60"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#1e2135] px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">Funding request</div>
            <h2 id="funding-request-title" className="mt-1 text-lg font-semibold text-white">
              Review request details
            </h2>
            <p id="funding-request-description" className="mt-1 text-sm leading-6 text-gray-500">
              Verify the recipient and settlement state before making an operator decision.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[40px] rounded-lg border border-[#2b3048] px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <dl className="divide-y divide-[#1e2135] px-5">
          <FundingDetail label="Request ID" value={request.id} mono />
          <FundingDetail
            label="Recipient"
            value={<AccountLink address={request.address} label={request.address} />}
          />
          <FundingDetail label="Amount" value={`${request.amountAeko} AEKO`} />
          <FundingDetail label="Source" value={request.source} />
          <FundingDetail label="Status" value={request.status} />
          <FundingDetail label="Requested" value={new Date(request.requestedAt).toLocaleString()} />
          <FundingDetail
            label="Decision time"
            value={request.decidedAt ? new Date(request.decidedAt).toLocaleString() : '—'}
          />
          <FundingDetail
            label="Submitted"
            value={request.submittedAt ? new Date(request.submittedAt).toLocaleString() : '—'}
          />
          <FundingDetail
            label="Confirmed"
            value={request.confirmedAt ? new Date(request.confirmedAt).toLocaleString() : '—'}
          />
          <FundingDetail
            label="Transaction"
            value={request.signature
              ? <TransactionLink signature={request.signature} label={request.signature} />
              : '—'}
          />
          <FundingDetail label="Error" value={request.errorCode ?? '—'} />
        </dl>

        <div className="border-t border-[#1e2135] bg-[#0d0e16]/70 px-5 py-4">
          {request.status === 'pending' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void onDecision(request.id, 'reject')}
                disabled={busy}
                className="min-h-[44px] rounded-lg border border-red-400/30 px-4 text-sm font-semibold text-red-200 transition-colors hover:bg-red-400/10 disabled:opacity-40"
              >
                Reject request
              </button>
              <button
                type="button"
                onClick={() => void onDecision(request.id, 'approve')}
                disabled={busy}
                className="min-h-[44px] rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:opacity-40"
              >
                {busy ? 'Working…' : 'Approve & release'}
              </button>
            </div>
          ) : request.status === 'submitted' ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void onDecision(request.id, 'reconcile')}
                disabled={busy}
                className="min-h-[44px] rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-400/15 disabled:opacity-40"
              >
                {busy ? 'Checking…' : 'Check confirmation'}
              </button>
            </div>
          ) : request.status === 'processing' ? (
            <div className="space-y-3">
              <div className="text-xs leading-5 text-amber-200">
                Funding submission is retrying safely. The persisted transaction intent is reused so no duplicate transfer is created.
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => void onDecision(request.id, 'reject')}
                  disabled={busy}
                  className="min-h-[44px] rounded-lg border border-red-400/30 px-4 text-sm font-semibold text-red-200 transition-colors hover:bg-red-400/10 disabled:opacity-40"
                >
                  Cancel request
                </button>
                <button
                  type="button"
                  onClick={() => void onDecision(request.id, 'reconcile')}
                  disabled={busy}
                  className="min-h-[44px] rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-400/15 disabled:opacity-40"
                >
                  {busy ? 'Retrying…' : 'Retry submission'}
                </button>
              </div>
            </div>
          ) : request.status === 'failed' ? (
            <div className="text-sm leading-6 text-red-200">
              Transfer failed on-chain. No funding history entry was recorded.
            </div>
          ) : (
            <div className="text-sm leading-6 text-gray-400">
              This request no longer requires an operator decision.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function FundingDetail({
  label,
  value,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
      <dt className="text-xs uppercase tracking-wider text-gray-600">{label}</dt>
      <dd className={`min-w-0 break-all text-sm text-gray-200 ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
