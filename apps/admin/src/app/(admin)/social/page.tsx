'use client'
import { useEffect, useState, useCallback } from 'react'
import StatCard from '@/components/stat-card'
import DataTable from '@/components/data-table'

type Post = { postId: string; creator: string; contentUri: string; postKind: string; visibility: string; createdAtUnix: number }
type Stake = { positionId: string; staker: string; creator: string; stakedAmount: number; accumulatedYield: number; claimedYield: number; state: string }
type Engagement = { actor: string; actionKind: string; targetPostId?: string; slot: number }

function shortAddr(a: string) { return a.slice(0, 8) + '…' + a.slice(-4) }
function fmtAeko(lamports: number) { return (lamports / 1e9).toFixed(4) + ' AEKO' }
function fmtTime(ts: number) { return new Date(ts * 1000).toLocaleDateString() }

type Tab = 'posts' | 'stakes' | 'engagement'

export default function SocialPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [stakes, setStakes] = useState<Stake[]>([])
  const [engagement, setEngagement] = useState<Engagement[]>([])
  const [tab, setTab] = useState<Tab>('posts')
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [postsRes, stakesRes, engRes] = await Promise.all([
        fetch('/api/explorer/posts?limit=50').then(r => r.ok ? r.json() : { data: [] }),
        fetch('/api/explorer/stakes?limit=50').then(r => r.ok ? r.json() : { data: [] }),
        fetch('/api/explorer/engagement?limit=50').then(r => r.ok ? r.json() : { data: [] }),
      ])
      setPosts(postsRes.data ?? [])
      setStakes(stakesRes.data ?? [])
      setEngagement(engRes.data ?? [])
      setLastUpdate(new Date().toLocaleTimeString())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [refresh])

  const totalStaked = stakes.filter(s => s.state === 'active').reduce((sum, s) => sum + s.stakedAmount, 0)
  const uniqueCreators = new Set(posts.map(p => p.creator)).size

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Social</h1>
          <p className="text-gray-500 text-sm mt-0.5">{lastUpdate ? `Updated ${lastUpdate}` : 'Loading…'}</p>
        </div>
        <button onClick={refresh} className="text-sm text-gray-400 hover:text-white border border-[#1e2135] rounded-lg px-4 py-2 transition-colors">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Posts" value={posts.length} accent />
        <StatCard label="Creators" value={uniqueCreators} />
        <StatCard label="Active Stakes" value={stakes.filter(s => s.state === 'active').length} />
        <StatCard label="Total Staked" value={fmtAeko(totalStaked)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#1e2135]">
        {(['posts', 'stakes', 'engagement'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-600 text-sm py-12 text-center">Loading…</div>
      ) : tab === 'posts' ? (
        <DataTable
          columns={['Post ID', 'Creator', 'Kind', 'Visibility', 'Date']}
          rows={posts.map(p => [
            p.postId.slice(0, 12) + '…',
            shortAddr(p.creator),
            p.postKind,
            <span key={p.postId} className={p.visibility === 'Public' ? 'text-emerald-400' : 'text-yellow-400'}>{p.visibility}</span>,
            fmtTime(p.createdAtUnix),
          ])}
          empty="No posts indexed yet"
        />
      ) : tab === 'stakes' ? (
        <DataTable
          columns={['Staker', 'Creator', 'Staked', 'Yield', 'State']}
          rows={stakes.map(s => [
            shortAddr(s.staker),
            shortAddr(s.creator),
            fmtAeko(s.stakedAmount),
            fmtAeko(s.accumulatedYield - s.claimedYield),
            <span key={s.positionId} className={s.state === 'active' ? 'text-emerald-400' : 'text-gray-500'}>{s.state}</span>,
          ])}
          empty="No stake positions indexed yet"
        />
      ) : (
        <DataTable
          columns={['Actor', 'Action', 'Post', 'Slot']}
          rows={engagement.map((e, i) => [
            shortAddr(e.actor),
            e.actionKind,
            e.targetPostId ? e.targetPostId.slice(0, 10) + '…' : '—',
            e.slot.toLocaleString(),
          ])}
          empty="No engagement events indexed yet"
        />
      )}
    </div>
  )
}
