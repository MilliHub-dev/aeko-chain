import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, Blocks, ChevronLeft, ChevronRight, Image, RotateCcw, Search, Sparkles, Wallet } from 'lucide-react';
import NetworkToggle from '../components/NetworkToggle';
import { fetchExplorerHome, getExplorerAvailability, searchExplorer } from '../utils/explorerApi';

export default function Explorer() {
  const [network, setNetwork] = useState('testnet');
  const [searchParams, setSearchParams] = useSearchParams();
  const [homeState, setHomeState] = useState({
    loading: true,
    error: '',
    blocks: [],
    transactions: [],
    posts: [],
    stakes: [],
    nfts: [],
  });
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [searchState, setSearchState] = useState({ loading: false, error: '', matches: [] });

  const unavailable = !getExplorerAvailability(network);
  const networkLabel = useMemo(() => network.charAt(0).toUpperCase() + network.slice(1), [network]);

  const filters = useMemo(
    () => ({
      txAddress: searchParams.get('txAddress') || '',
      txType: searchParams.get('txType') || '',
      txStatus: searchParams.get('txStatus') || '',
      txBefore: searchParams.get('txBefore') || '',
      txAfter: searchParams.get('txAfter') || '',
      postCreator: searchParams.get('postCreator') || '',
      postKind: searchParams.get('postKind') || '',
      postVisibility: searchParams.get('postVisibility') || '',
      postBefore: searchParams.get('postBefore') || '',
      postAfter: searchParams.get('postAfter') || '',
      blockBefore: searchParams.get('blockBefore') || '',
      blockAfter: searchParams.get('blockAfter') || '',
      stakeWallet: searchParams.get('stakeWallet') || '',
      stakeCreator: searchParams.get('stakeCreator') || '',
      stakeStaker: searchParams.get('stakeStaker') || '',
      stakeState: searchParams.get('stakeState') || '',
      nftCollection: searchParams.get('nftCollection') || '',
      nftOwner: searchParams.get('nftOwner') || '',
      nftCreator: searchParams.get('nftCreator') || '',
    }),
    [searchParams],
  );

  useEffect(() => {
    if (unavailable) {
      setHomeState({
        loading: false,
        error: '',
        blocks: [],
        transactions: [],
        posts: [],
        stakes: [],
        nfts: [],
      });
      return;
    }

    let cancelled = false;
    setHomeState((current) => ({ ...current, loading: true, error: '' }));

    fetchExplorerHome(network, filters)
      .then((data) => {
        if (!cancelled) {
          setHomeState({
            loading: false,
            error: '',
            blocks: data.blocks || [],
            transactions: data.transactions || [],
            posts: data.posts || [],
            stakes: data.stakes || [],
            nfts: data.nfts || [],
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHomeState({
            loading: false,
            error: error.message,
            blocks: [],
            transactions: [],
            posts: [],
            stakes: [],
            nfts: [],
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [network, unavailable, filters]);

  async function handleSearch(event) {
    event.preventDefault();
    if (!query.trim() || unavailable) {
      return;
    }

    setSearchState({ loading: true, error: '', matches: [] });
    try {
      const payload = await searchExplorer(network, query.trim());
      setSearchState({
        loading: false,
        error: '',
        matches: payload.matches || [],
      });
      const next = new URLSearchParams(searchParams);
      next.set('q', query.trim());
      setSearchParams(next, { replace: true });
    } catch (error) {
      setSearchState({ loading: false, error: error.message, matches: [] });
    }
  }

  function updateFilter(name, value) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(name, value);
    } else {
      next.delete(name);
    }
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams);
    [
      'txAddress',
      'txType',
      'txStatus',
      'txBefore',
      'txAfter',
      'postCreator',
      'postKind',
      'postVisibility',
      'postBefore',
      'postAfter',
      'blockBefore',
      'blockAfter',
      'stakeWallet',
      'stakeCreator',
      'stakeStaker',
      'stakeState',
      'nftCollection',
      'nftOwner',
      'nftCreator',
    ].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  }

  function paginateWindow(kind, direction) {
    const next = new URLSearchParams(searchParams);

    if (kind === 'blocks') {
      const items = homeState.blocks;
      if (!items.length) return;
      if (direction === 'older') {
        next.set('blockBefore', String(items[items.length - 1].slot));
        next.delete('blockAfter');
      } else if (direction === 'newer') {
        next.set('blockAfter', String(items[0].slot));
        next.delete('blockBefore');
      } else {
        next.delete('blockBefore');
        next.delete('blockAfter');
      }
    }

    if (kind === 'transactions') {
      const items = homeState.transactions;
      if (!items.length) return;
      if (direction === 'older') {
        next.set('txBefore', String(items[items.length - 1].slot));
        next.delete('txAfter');
      } else if (direction === 'newer') {
        next.set('txAfter', String(items[0].slot));
        next.delete('txBefore');
      } else {
        next.delete('txBefore');
        next.delete('txAfter');
      }
    }

    if (kind === 'posts') {
      const items = homeState.posts;
      if (!items.length) return;
      if (direction === 'older') {
        next.set('postBefore', String(items[items.length - 1].createdAtUnix));
        next.delete('postAfter');
      } else if (direction === 'newer') {
        next.set('postAfter', String(items[0].createdAtUnix));
        next.delete('postBefore');
      } else {
        next.delete('postBefore');
        next.delete('postAfter');
      }
    }

    setSearchParams(next, { replace: true });
  }

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-12">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-aeko-accent mb-3">Explorer</div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Aeko Scan</h1>
          <p className="text-lg text-gray-400 max-w-3xl">
            Inspect live blocks, transactions, account activity, creator rewards, and SocialFi state from the explorer backend.
          </p>
        </div>
        <NetworkToggle value={network} onChange={setNetwork} />
      </div>

      <form onSubmit={handleSearch} className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search blocks, transactions, addresses, posts, NFTs"
          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-28 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-aeko-accent/50"
        />
        <button
          type="submit"
          className="absolute right-2 top-2 bottom-2 px-5 rounded-xl bg-aeko-accent/10 hover:bg-aeko-accent/20 text-aeko-accent transition-colors"
        >
          Search
        </button>
      </form>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between gap-4 mb-5">
          <h2 className="text-lg font-bold">Explorer Filters</h2>
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <FilterInput label="Tx Address" value={filters.txAddress} onChange={(value) => updateFilter('txAddress', value)} />
          <FilterInput label="Tx Program" value={filters.txType} onChange={(value) => updateFilter('txType', value)} />
          <FilterSelect label="Tx Status" value={filters.txStatus} onChange={(value) => updateFilter('txStatus', value)} options={['', 'success', 'failed']} />
          <FilterInput label="Post Creator" value={filters.postCreator} onChange={(value) => updateFilter('postCreator', value)} />
          <FilterSelect label="Post Kind" value={filters.postKind} onChange={(value) => updateFilter('postKind', value)} options={['', 'original', 'reply', 'repost', 'quote']} />
          <FilterSelect label="Visibility" value={filters.postVisibility} onChange={(value) => updateFilter('postVisibility', value)} options={['', 'public', 'followers-only', 'permissioned', 'paid']} />
          <FilterInput label="Stake Wallet" value={filters.stakeWallet} onChange={(value) => updateFilter('stakeWallet', value)} />
          <FilterInput label="Stake Creator" value={filters.stakeCreator} onChange={(value) => updateFilter('stakeCreator', value)} />
          <FilterSelect label="Stake State" value={filters.stakeState} onChange={(value) => updateFilter('stakeState', value)} options={['', 'active', 'cooling-down', 'closed', 'slashed']} />
          <FilterInput label="NFT Collection" value={filters.nftCollection} onChange={(value) => updateFilter('nftCollection', value)} />
          <FilterInput label="NFT Owner" value={filters.nftOwner} onChange={(value) => updateFilter('nftOwner', value)} />
          <FilterInput label="NFT Creator" value={filters.nftCreator} onChange={(value) => updateFilter('nftCreator', value)} />
        </div>
      </div>

      {unavailable ? (
        <div className="mb-8 bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-2xl p-6">
          Explorer API not configured for {network}.
        </div>
      ) : null}

      {!unavailable && searchState.error ? (
        <div className="mb-8 bg-red-500/10 border border-red-500/20 text-red-200 rounded-2xl p-6">
          {searchState.error}
        </div>
      ) : null}

      {!unavailable && (searchState.loading || searchState.matches.length > 0) ? (
        <div className="mb-10 bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">Search Results</h2>
          {searchState.loading ? (
            <div className="text-gray-400">Searching {networkLabel.toLowerCase()} index...</div>
          ) : (
            <div className="space-y-3">
              {searchState.matches.map((match, index) => (
                <SearchResultRow key={`${match.kind}-${index}`} match={match} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!unavailable && homeState.error ? (
        <div className="mb-8 bg-red-500/10 border border-red-500/20 text-red-200 rounded-2xl p-6">
          {homeState.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-10">
        <StatCard icon={Blocks} label="Recent Blocks" value={homeState.blocks.length} />
        <StatCard icon={Activity} label="Recent Transactions" value={homeState.transactions.length} />
        <StatCard icon={Sparkles} label="Indexed Posts" value={homeState.posts.length} />
        <StatCard icon={Wallet} label="Stake Records" value={homeState.stakes.length} />
        <StatCard icon={Image} label="NFT Records" value={homeState.nfts.length} />
      </div>

      {!unavailable && homeState.loading ? (
        <div className="text-gray-400">Loading explorer dashboard...</div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Panel
          title="Latest Blocks"
          controls={
            <PagerControls
              active={Boolean(filters.blockBefore || filters.blockAfter)}
              onOlder={() => paginateWindow('blocks', 'older')}
              onNewer={() => paginateWindow('blocks', 'newer')}
              onReset={() => paginateWindow('blocks', 'reset')}
            />
          }
        >
          {homeState.blocks.map((block) => (
            <Link
              key={block.slot}
              to={`/explorer/block/${block.slot}`}
              className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0"
            >
              <div>
                <div className="font-mono text-aeko-accent">#{block.slot}</div>
                <div className="text-xs text-gray-500">{block.blockhash}</div>
              </div>
              <div className="text-xs text-gray-400">{block.transactionCount} txns</div>
            </Link>
          ))}
        </Panel>

        <Panel
          title="Latest Transactions"
          controls={
            <PagerControls
              active={Boolean(filters.txBefore || filters.txAfter)}
              onOlder={() => paginateWindow('transactions', 'older')}
              onNewer={() => paginateWindow('transactions', 'newer')}
              onReset={() => paginateWindow('transactions', 'reset')}
            />
          }
        >
          {homeState.transactions.map((tx) => (
            <Link
              key={tx.signature}
              to={`/explorer/tx/${tx.signature}`}
              className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0"
            >
              <div>
                <div className="font-mono text-aeko-accent text-sm break-all">{tx.signature}</div>
                <div className="text-xs text-gray-500">{tx.primaryProgram || 'transaction'}</div>
              </div>
              <div className="text-xs text-gray-400">slot {tx.slot}</div>
            </Link>
          ))}
        </Panel>

        <Panel
          title="Recent Posts"
          controls={
            <PagerControls
              active={Boolean(filters.postBefore || filters.postAfter)}
              onOlder={() => paginateWindow('posts', 'older')}
              onNewer={() => paginateWindow('posts', 'newer')}
              onReset={() => paginateWindow('posts', 'reset')}
            />
          }
        >
          {homeState.posts.map((post) => (
            <Link
              key={post.postId}
              to={`/explorer/post/${post.postId}`}
              className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0"
            >
              <div>
                <div className="font-mono text-aeko-accent text-sm">{post.postId}</div>
                <div className="text-xs text-gray-500 break-all">{post.creator}</div>
              </div>
              <div className="text-xs text-gray-400">{post.visibility}</div>
            </Link>
          ))}
        </Panel>

        <Panel title="Recent Stakes">
          {homeState.stakes.map((stake) => (
            <Link
              key={stake.positionId}
              to={`/explorer/creator/${stake.creator}`}
              className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0"
            >
              <div>
                <div className="font-mono text-aeko-accent text-sm">{stake.positionId}</div>
                <div className="text-xs text-gray-500 break-all">{stake.staker}</div>
              </div>
              <div className="text-xs text-gray-400">{stake.stakedAmount} AEKO</div>
            </Link>
          ))}
        </Panel>

        <Panel title="Recent NFTs">
          {homeState.nfts.map((nft) => (
            <Link
              key={nft.tokenId}
              to={`/explorer/nft/${nft.tokenId}`}
              className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0"
            >
              <div>
                <div className="font-mono text-aeko-accent text-sm break-all">{nft.tokenId}</div>
                <div className="text-xs text-gray-500 break-all">{nft.owner}</div>
              </div>
              <div className="text-xs text-gray-400">{nft.frozen ? 'Frozen' : 'Active'}</div>
            </Link>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-center gap-3 text-gray-400 mb-3">
        <Icon className="h-5 w-5 text-aeko-accent" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function Panel({ title, controls, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold">{title}</h2>
        {controls}
      </div>
      {items.length ? items : <div className="text-sm text-gray-500">No indexed records yet.</div>}
    </div>
  );
}

function PagerControls({ active, onOlder, onNewer, onReset }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onNewer}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Newer
      </button>
      <button
        type="button"
        onClick={onOlder}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
      >
        Older
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      {active ? (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-aeko-accent/10 border border-aeko-accent/20 text-aeko-accent hover:text-white hover:bg-aeko-accent/20 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      ) : null}
    </div>
  );
}

function FilterInput({ label, value, onChange }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-aeko-accent/40"
      />
    </label>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">{label}</div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-aeko-accent/40"
      >
        {options.map((option) => (
          <option key={option || 'all'} value={option} className="bg-aeko-dark">
            {option || 'All'}
          </option>
        ))}
      </select>
    </label>
  );
}

function SearchResultRow({ match }) {
  const data = match[match.kind];
  let href = '/explorer';

  if (match.kind === 'block') href = `/explorer/block/${data.slot}`;
  if (match.kind === 'transaction') href = `/explorer/tx/${data.signature}`;
  if (match.kind === 'wallet') href = `/explorer/account/${data.address}`;
  if (match.kind === 'tokenTransfer') href = `/explorer/token/${data.mint}`;
  if (match.kind === 'socialPost') href = `/explorer/post/${data.postId}`;
  if (match.kind === 'nft') href = `/explorer/nft/${data.tokenId}`;

  return (
    <Link to={href} className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0">
      <div className="text-sm text-white">{match.kind}</div>
      <div className="font-mono text-xs text-aeko-accent break-all text-right max-w-[75%]">
        {JSON.stringify(data)}
      </div>
    </Link>
  );
}
