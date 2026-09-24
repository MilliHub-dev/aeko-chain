'use client'

import { useCallback, useEffect, useState } from 'react'
import DataTable from '@/components/data-table'
import SectionTabs from '@/components/section-tabs'
import StatCard from '@/components/stat-card'

type Post = { postId: string; creator: string; contentUri: string; postKind: string; visibility: string; createdAtUnix: number }
type Stake = { positionId: string; staker: string; creator: string; stakedAmount: number; accumulatedYield: number; claimedYield: number; state: string }
type Engagement = { actor: string; actionKind: string; targetPostId?: string; slot: number }

type SocialRegistry = {
  schemaVersion: number | null
  genesisHash: string | null
  posts: string | null
  rewards: string | null
  staking: string | null
  antiSpam: string | null
  monetization: string | null
  rewardsTreasury: string | null
  rewardVault: string | null
  stakeVault: string | null
  stakeRewardVault: string | null
  treasury: string | null
  platformFeeBps: number | null
  complete: boolean
}

type SocialDomainStatus = {
  stateAccount: string | null
  programId: string
  present: boolean
  ownerMatches: boolean
  initialized: boolean
  condition: string
  metrics: Record<string, unknown>
  error: string | null
}

type SocialStatus = {
  complete: boolean
  condition: string
  registryComplete: boolean
  registrySchemaVersion: number | null
  registryGenesisHash: string | null
  bootstrapInProgress: boolean
  liveGenesisHash: string
  genesisMatches: boolean
  domains: Record<string, SocialDomainStatus>
}

type ActivityTab = 'posts' | 'stakes' | 'engagement'
type SocialView = 'health' | 'activity'

function shortAddr(value: string) {
  return value.length > 18 ? value.slice(0, 8) + '…' + value.slice(-4) : value
}

function fmtAeko(lamports: number) {
  return (lamports / 1e9).toFixed(4) + ' AEKO'
}

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleDateString()
}

async function readEnvelope<T>(path: string, fallback: T): Promise<T> {
  const response = await fetch('/api/explorer/' + path, { cache: 'no-store' })
  if (!response.ok) return fallback
  const payload = await response.json().catch(() => null)
  return (payload?.data ?? fallback) as T
}

export default function SocialPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [stakes, setStakes] = useState<Stake[]>([])
  const [engagement, setEngagement] = useState<Engagement[]>([])
  const [registry, setRegistry] = useState<SocialRegistry | null>(null)
  const [socialStatus, setSocialStatus] = useState<SocialStatus | null>(null)
  const [activityTab, setActivityTab] = useState<ActivityTab>('posts')
  const [view, setView] = useState<SocialView>('health')
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')
  const [statusError, setStatusError] = useState('')

  const refresh = useCallback(async () => {
    setStatusError('')
    try {
      const [nextPosts, nextStakes, nextEngagement, nextRegistry, nextStatus] = await Promise.all([
        readEnvelope<Post[]>('posts?limit=50', []),
        readEnvelope<Stake[]>('stakes?limit=50', []),
        readEnvelope<Engagement[]>('engagement?limit=50', []),
        readEnvelope<SocialRegistry | null>('registry/social', null),
        readEnvelope<SocialStatus | null>('social/status', null),
      ])
      setPosts(nextPosts)
      setStakes(nextStakes)
      setEngagement(nextEngagement)
      setRegistry(nextRegistry)
      setSocialStatus(nextStatus)
      if (!nextRegistry || !nextStatus) {
        setStatusError('Social registry or live SocialFi status is unavailable from Explorer.')
      }
      setLastUpdate(new Date().toLocaleTimeString())
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to refresh SocialFi state')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [refresh])

  const totalStaked = stakes.filter((item) => item.state === 'active').reduce((sum, item) => sum + item.stakedAmount, 0)
  const uniqueCreators = new Set(posts.map((post) => post.creator)).size
  const domainEntries = Object.entries(socialStatus?.domains ?? {})
  const healthyDomains = domainEntries.filter(([, domain]) => domain.condition === 'healthy').length
  const activityCount = posts.length + stakes.length + engagement.length

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-emerald-400">SocialFi control plane</div>
          <h1 className="mt-1 text-2xl font-bold text-white">AEKO Social</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
            Keep live registry health separate from indexed Social activity so operators can diagnose the chain without losing the activity view.
          </p>
          <p className="mt-1 text-xs text-gray-600">{lastUpdate ? 'Updated ' + lastUpdate : 'Loading…'}</p>
        </div>
        <button onClick={refresh} disabled={loading} className="min-h-[42px] rounded-lg border border-[#1e2135] px-4 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {statusError ? (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {statusError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
        <StatCard label="Registry" value={registry ? (registry.complete ? 'Complete' : 'Incomplete') : '—'} accent={Boolean(registry?.complete)} />
        <StatCard label="Live SocialFi State" value={socialStatus ? (socialStatus.complete ? 'Complete' : 'Incomplete') : '—'} accent={Boolean(socialStatus?.complete)} />
        <StatCard label="Healthy Domains" value={socialStatus ? healthyDomains + ' / ' + domainEntries.length : '—'} />
        <StatCard label="Platform Fee" value={registry?.platformFeeBps == null ? '—' : registry.platformFeeBps + ' bps'} />
      </div>

      <SectionTabs
        label="Social administration sections"
        value={view}
        onChange={setView}
        items={[
          { value: 'health', label: 'Health & registry', description: 'Canonical state and ownership', count: healthyDomains },
          { value: 'activity', label: 'Indexed activity', description: 'Posts, stakes and engagement', count: activityCount },
        ]}
      />

      {view === 'health' ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-[#1e2135] bg-[#12141f] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold text-white">Chain binding</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  Registry syntax and live validator identity are separate checks. A stale registry cannot appear healthy merely because every address is present.
                </p>
              </div>
              <span className={socialStatus?.genesisMatches ? 'text-xs text-emerald-400' : 'text-xs text-amber-300'}>
                {socialStatus?.condition ?? 'unavailable'}
              </span>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <InfoRow label="Schema" value={registry?.schemaVersion == null ? 'missing' : 'v' + registry.schemaVersion} />
              <InfoRow label="Registry genesis" value={registry?.genesisHash ? shortAddr(registry.genesisHash) : 'missing'} mono />
              <InfoRow label="Live genesis" value={socialStatus?.liveGenesisHash ? shortAddr(socialStatus.liveGenesisHash) : '—'} mono />
              <InfoRow label="Binding" value={socialStatus ? (socialStatus.genesisMatches ? 'matches' : 'mismatch') : '—'} />
              <InfoRow label="Bootstrap" value={socialStatus ? (socialStatus.bootstrapInProgress ? 'in progress' : 'settled') : '—'} />
            </div>
          </section>

          <section className="rounded-xl border border-[#1e2135] bg-[#12141f]">
            <div className="border-b border-[#1e2135] px-5 py-4">
              <h2 className="font-semibold text-white">SocialFi domains</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">Each domain is checked against its canonical registry state account and native program owner.</p>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {domainEntries.length ? domainEntries.map(([name, domain]) => {
                const healthy = domain.condition === 'healthy'
                return (
                  <div key={name} className="rounded-xl border border-[#1e2135] bg-[#0a0b12] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-gray-100">{name}</div>
                      <span className={healthy ? 'text-xs text-emerald-400' : 'text-xs text-amber-300'}>
                        {healthy ? 'ready' : 'attention'}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-xs">
                      <InfoRow label="State" value={domain.stateAccount ? shortAddr(domain.stateAccount) : 'missing'} mono />
                      <InfoRow label="Program" value={shortAddr(domain.programId)} mono />
                      <InfoRow label="Presence" value={domain.present ? 'exists' : 'missing'} />
                      <InfoRow label="Owner" value={!domain.present ? 'not applicable' : domain.ownerMatches ? 'matches' : 'mismatch'} />
                      <InfoRow label="Initialized" value={domain.initialized ? 'yes' : 'no'} />
                      <InfoRow label="Condition" value={domain.condition} />
                    </div>
                    {Object.keys(domain.metrics ?? {}).length ? (
                      <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-[#1e2135] bg-black/20 p-3 text-[11px] leading-5 text-gray-500">
                        {JSON.stringify(domain.metrics, null, 2)}
                      </pre>
                    ) : null}
                    {domain.error ? <div className="mt-3 text-xs text-amber-200">{domain.error}</div> : null}
                  </div>
                )
              }) : <div className="text-sm text-gray-600">No live SocialFi domain status returned.</div>}
            </div>
          </section>
        </div>
      ) : null}

      {view === 'activity' ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
            <StatCard label="Indexed Posts" value={posts.length} />
            <StatCard label="Indexed Creators" value={uniqueCreators} />
            <StatCard label="Active Stakes" value={stakes.filter((item) => item.state === 'active').length} />
            <StatCard label="Indexed Stake Value" value={fmtAeko(totalStaked)} />
          </div>

          <div className="rounded-2xl border border-[#1e2135] bg-[#12141f] p-4 sm:p-5">
            <div className="mb-4 flex gap-1 overflow-x-auto border-b border-[#1e2135]">
              {(['posts', 'stakes', 'engagement'] as ActivityTab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setActivityTab(item)}
                  className={
                    '-mb-px min-h-[42px] border-b-2 px-4 text-sm capitalize transition-colors ' +
                    (activityTab === item
                      ? 'border-emerald-400 text-emerald-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300')
                  }
                >
                  {item}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-gray-600">Loading…</div>
            ) : activityTab === 'posts' ? (
              <DataTable
                paginationLabel="posts"
                columns={['Post ID', 'Creator', 'Kind', 'Visibility', 'Date']}
                rows={posts.map((post) => [
                  post.postId.slice(0, 12) + '…',
                  shortAddr(post.creator),
                  post.postKind,
                  <span key={post.postId} className={post.visibility === 'Public' ? 'text-emerald-400' : 'text-yellow-400'}>{post.visibility}</span>,
                  fmtTime(post.createdAtUnix),
                ])}
                empty="No posts indexed yet"
              />
            ) : activityTab === 'stakes' ? (
              <DataTable
                paginationLabel="stake positions"
                columns={['Staker', 'Creator', 'Staked', 'Yield', 'State']}
                rows={stakes.map((stake) => [
                  shortAddr(stake.staker),
                  shortAddr(stake.creator),
                  fmtAeko(stake.stakedAmount),
                  fmtAeko(stake.accumulatedYield - stake.claimedYield),
                  <span key={stake.positionId} className={stake.state === 'active' ? 'text-emerald-400' : 'text-gray-500'}>{stake.state}</span>,
                ])}
                empty="No stake positions indexed yet"
              />
            ) : (
              <DataTable
                paginationLabel="engagement events"
                columns={['Actor', 'Action', 'Post', 'Slot']}
                rows={engagement.map((event, index) => [
                  shortAddr(event.actor),
                  event.actionKind,
                  event.targetPostId ? event.targetPostId.slice(0, 10) + '…' : '—',
                  <span key={event.slot + '-' + index} className="tabular-nums">{event.slot.toLocaleString()}</span>,
                ])}
                empty="No engagement events indexed yet"
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-600">{label}</span>
      <span className={mono ? 'text-right font-mono text-gray-300' : 'text-right text-gray-300'}>{value}</span>
    </div>
  )
}
