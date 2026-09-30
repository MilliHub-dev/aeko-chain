'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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
  maxManualGrantAeko: number
  consoleAirdropCapAeko: number
  revision: number
  updatedAt: string
}

type FundingSnapshot = {
  network: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
  mode: 'test-funding'
  settings: Settings | null
  dailyRemainingAeko: number | null
  publicSpentAeko: number | null
  publicReservedAeko: number | null
  consoleAirdropAggregateUnlimited: boolean
  faucetPerRequestCapAeko: number | null
}

type Grant = {
  id: string
  requestId?: string | null
  address: string
  amountAeko: number
  signature?: string | null
  grantedAt: string
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
  errorMessage?: string | null
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
  errorMessage?: string | null
}

type FundingView = 'queue' | 'policy' | 'history' | 'airdrops'

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-[#1e2135] bg-[#0d0e16] px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 mono'

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!payload) {
    throw Object.assign(
      new Error(`Funding control plane returned HTTP ${response.status} without JSON`),
      { status: response.status },
    )
  }
  if (!response.ok) {
    throw Object.assign(
      new Error(payload.error?.message ?? `Funding request failed with HTTP ${response.status}`),
      { status: response.status, code: payload.error?.code },
    )
  }
  return payload
}

const fundingKeys = {
  all: ['admin', 'funding'] as const,
  settings: ['admin', 'funding', 'settings'] as const,
  grants: ['admin', 'funding', 'grants'] as const,
  airdrops: ['admin', 'funding', 'airdrops'] as const,
  requests: ['admin', 'funding', 'requests'] as const,
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function FundingGrantsPage() {
  const [draft, setDraft] = useState<Settings | null>(null)
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('10')
  const [view, setView] = useState<FundingView>('queue')
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
  const isFundingAvailable = snapshot?.mode === 'test-funding'

  const grantsQuery = useQuery({
    queryKey: fundingKeys.grants,
    queryFn: async () => {
      const payload = await readJson(
        await fetch('/api/admin/funding/grants?limit=100', { cache: 'no-store' }),
      )
      return (payload.data ?? []) as Grant[]
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

  const grants = grantsQuery.data ?? []
  const airdrops = airdropsQuery.data ?? []
  const requests = requestsQuery.data ?? []

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

  const manualGrantMutation = useMutation({
    retry: false,
    mutationFn: async ({
      recipient,
      amountAeko,
    }: {
      recipient: string
      amountAeko: number
    }) => {
      const payload = await readJson(
        await fetch('/api/admin/funding/grant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: recipient, amountAeko }),
        }),
      )
      return payload.data as Grant
    },
  })

  async function refresh() {
    const work: Array<Promise<unknown>> = [snapshotQuery.refetch()]
    if (isFundingAvailable) {
      work.push(grantsQuery.refetch(), airdropsQuery.refetch(), requestsQuery.refetch())
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
        maxManualGrantAeko: draft.maxManualGrantAeko,
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
          `Grant confirmed: ${request.amountAeko} AEKO to ${request.address}`,
          { title: 'Grant confirmed' },
        )
      } else {
        toast.info(
          `Grant is ${request.status}; no duplicate transfer will be submitted while confirmation is unresolved.`,
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

  async function manualGrant(e: React.FormEvent) {
    e.preventDefault()
    if (!isFundingAvailable) return

    try {
      const grant = await manualGrantMutation.mutateAsync({
        recipient: address.trim(),
        amountAeko: Number(amount),
      })
      const signature = String(grant.signature ?? '')
      const message = `Sent ${grant.amountAeko} AEKO — ${grant.confirmed ? 'confirmed' : 'submitted'}${signature ? ` (${signature.slice(0, 16)}…)` : ''}`
      if (grant.confirmed) {
        toast.success(message, { title: 'Grant confirmed' })
      } else {
        toast.info(message, { title: 'Grant submitted' })
      }
      setAddress('')
      await invalidateFunding()
    } catch (error) {
      toast.error(messageFrom(error, 'Grant failed'), { title: 'Grant failed' })
    }
  }

  const requestBusy = decisionMutation.isPending
    ? decisionMutation.variables?.id ?? ''
    : ''
  const busy = settingsMutation.isPending || manualGrantMutation.isPending
  const syncing =
    snapshotQuery.isFetching
    || grantsQuery.isFetching
    || airdropsQuery.isFetching
    || requestsQuery.isFetching
  const syncError = [
    snapshotQuery.error,
    grantsQuery.error,
    airdropsQuery.error,
    requestsQuery.error,
  ].find(Boolean)
  const syncErrorMessage = syncError
    ? messageFrom(syncError, 'Funding control plane is unavailable')
    : ''
  const lastSyncedTimestamp = Math.max(
    snapshotQuery.dataUpdatedAt,
    grantsQuery.dataUpdatedAt,
    airdropsQuery.dataUpdatedAt,
    requestsQuery.dataUpdatedAt,
  )
  const lastSyncedAt = lastSyncedTimestamp ? new Date(lastSyncedTimestamp) : null

  const field = (key: keyof Pick<Settings, 'amountAeko' | 'cooldownHours' | 'dailyBudgetAeko' | 'maxManualGrantAeko' | 'consoleAirdropCapAeko'>, label: string, step = '1') =>
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
          <h1 className="mt-1 text-2xl font-bold text-white">Funding, grants & airdrops</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            {!snapshot
              ? 'Loading the live funding policy and settlement state for this network.'
              : 'Review public funding requests, maintain network policy, and keep operator grants separate from direct developer airdrops.'}
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
        <StatCard label="Grant history" value={isFundingAvailable ? grants.length : '—'} />
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
              {snapshot?.consoleAirdropAggregateUnlimited ? 'No daily allocation ceiling' : 'Policy limited'}
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
              onClick={() => void refresh()
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
              { value: 'queue', label: 'Grant queue', description: 'Admin decisions and submitted grant reconciliation', count: attentionRequests.length },
              { value: 'policy', label: 'Policy & manual grant', description: 'Public limits and Admin-only grant actions' },
              { value: 'history', label: 'Grant history', description: 'Confirmed Admin-approved grants', count: grants.length },
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
                paginationLabel="requests"
                columns={['Requested', 'Address', 'Amount', 'Source', 'Status', 'Decision']}
                rows={attentionRequests.map((request) => [
                  new Date(request.requestedAt).toLocaleString(),
                  request.address.slice(0, 10) + '…' + request.address.slice(-6),
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
                  <div key={request.id} className="flex flex-wrap items-center gap-2">
                    {request.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => decideRequest(request.id, 'approve')}
                          disabled={Boolean(requestBusy)}
                          className="min-h-[40px] w-full rounded-lg bg-emerald-400 px-3 sm:w-auto text-xs font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {requestBusy === request.id ? 'Working…' : 'Approve & release'}
                        </button>
                        <button
                          type="button"
                          onClick={() => decideRequest(request.id, 'reject')}
                          disabled={Boolean(requestBusy)}
                          className="min-h-[40px] w-full rounded-lg border border-[#2b3048] px-3 sm:w-auto text-xs text-gray-300 transition-colors hover:border-red-400/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Reject
                        </button>
                      </>
                    ) : request.status === 'submitted' ? (
                      <button
                        type="button"
                        onClick={() => decideRequest(request.id, 'reconcile')}
                        disabled={Boolean(requestBusy)}
                        className="min-h-[40px] w-full rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 sm:w-auto text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/15 disabled:opacity-40"
                      >
                        {requestBusy === request.id ? 'Checking…' : 'Check confirmation'}
                      </button>
                    ) : request.status === 'processing' ? (
                      <div key={request.id} className="flex max-w-xs flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => decideRequest(request.id, 'reconcile')}
                            disabled={Boolean(requestBusy)}
                            className="min-h-[40px] w-full rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 sm:w-auto text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/15 disabled:opacity-40"
                          >
                            {requestBusy === request.id ? 'Retrying…' : 'Retry submission'}
                          </button>
                          <button
                            type="button"
                            onClick={() => decideRequest(request.id, 'reject')}
                            disabled={Boolean(requestBusy)}
                            className="min-h-[40px] w-full rounded-lg border border-[#2b3048] px-3 sm:w-auto text-xs text-gray-300 transition-colors hover:border-red-400/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Cancel request
                          </button>
                        </div>
                        <span className="text-xs leading-5 text-amber-200">
                          Submission response was not obtained yet. Retrying safely replays only the persisted transaction intent; no second grant will be created. Cancelling first replays once and only releases the wallet when no signature exists.
                          {request.errorMessage ? ` Detail: ${request.errorMessage}` : ''}
                        </span>
                      </div>
                    ) : (
                      <span className="max-w-xs text-xs leading-5 text-red-300">
                        Transfer failed on-chain. No grant was recorded.
                      </span>
                    )}
                  </div>,
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
                  {field('maxManualGrantAeko', 'Max operator grant (AEKO)', '0.1')}
                  {field('consoleAirdropCapAeko', 'Developer airdrop cap / request (AEKO)', '0.1')}
                </div>
                <div className="mt-4 text-xs text-gray-600">
                  Policy revision {settings?.revision ?? '—'} · updated {settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString() : '—'}
                </div>
                <button type="submit" disabled={settingsMutation.isPending || !draft} className="mt-5 min-h-[44px] rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                  {settingsMutation.isPending ? 'Saving…' : 'Save policy'}
                </button>
              </form>

              <form onSubmit={manualGrant} className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-5 sm:p-6">
                <div className="mb-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-300">Operator action</div>
                  <h2 className="mt-1 font-semibold text-white">Manual operator grant</h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    Sends an AEKO transfer without consuming the public-request daily allocation. The operator grant cap and the private Faucet hard cap still apply.
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
                <button type="submit" disabled={manualGrantMutation.isPending || !address} className="mt-5 min-h-[44px] rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                  {manualGrantMutation.isPending ? 'Sending…' : 'Send manual grant'}
                </button>
              </form>
            </div>
          ) : null}

          {view === 'airdrops' ? (
            <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-white">Developer Test Console airdrops</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Direct developer airdrops bypass the public grant approval queue, but remain rate-limited, capped per request, and durably tracked.
                </p>
              </div>
              <DataTable
                paginationLabel="airdrops"
                columns={['Requested', 'Address', 'Amount', 'Status', 'Signature', 'Error']}
                rows={airdrops.map((airdrop) => [
                  new Date(airdrop.requestedAt).toLocaleString(),
                  airdrop.address.slice(0, 10) + '…' + airdrop.address.slice(-6),
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
                  airdrop.signature ? airdrop.signature.slice(0, 16) + '…' : '—',
                  airdrop.errorCode ?? '—',
                ])}
                empty="No developer airdrops have been requested yet"
              />
            </section>
          ) : null}

          {view === 'history' ? (
            <section className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-white">Confirmed grants</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Only confirmed public requests approved by Admin and confirmed manual Admin grants appear here. Developer airdrops are deliberately separate.
                </p>
              </div>
              <DataTable
                paginationLabel="grants"
                columns={['When', 'Address', 'Amount', 'Source', 'Status', 'Signature']}
                rows={grants.map((grant) => [
                  new Date(grant.grantedAt).toLocaleString(),
                  grant.address.slice(0, 10) + '…' + grant.address.slice(-6),
                  `${grant.amountAeko} AEKO`,
                  grant.source,
                  <span key={grant.id} className={grant.confirmed ? 'text-emerald-300' : 'text-yellow-300'}>{grant.confirmed ? 'confirmed' : 'submitted'}</span>,
                  grant.signature ? grant.signature.slice(0, 16) + '…' : '—',
                ])}
                empty="No confirmed grants have been released yet"
              />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
