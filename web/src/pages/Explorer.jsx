import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, Blocks, ChevronLeft, ChevronRight, Image, RotateCcw, Search, Sparkles, Wallet } from 'lucide-react';
import NetworkToggle from '../components/NetworkToggle';
import { fetchExplorerHome, getExplorerAvailability, searchExplorer } from '../utils/explorerApi';
import {
  ActiveFiltersBar,
  ExplorerFiltersModal,
  FILTER_FIELDS,
  sanitizeCursor,
  sanitizeSearchQuery,
  SEARCH_QUERY_MIN,
} from '../components/ExplorerFilters';
import { StatusBannerStack } from '../components/StatusBanner';
import { useToaster } from '../components/Toaster';

// Wait this long after the last filter change before firing a new fetch.
// Removing three chips in quick succession should be ONE backend call, not
// three. 250ms is short enough that single removals still feel instant.
const FILTER_FETCH_DEBOUNCE_MS = 250;

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const toaster = useToaster();

  const unavailable = !getExplorerAvailability(network);
  const networkLabel = useMemo(() => network.charAt(0).toUpperCase() + network.slice(1), [network]);

  // Sanitize every URL-derived filter value before it can reach the backend.
  // Hand-edited URLs can carry anything — control chars, megabyte strings,
  // SQL-keyword pastes. sqlx parameterizes so injection is impossible, but
  // an unsanitized value still costs a wasted scan. Clip to reasonable
  // bounds and drop obviously-bad cursors.
  const filters = useMemo(() => {
    const get = (key, max = 128) => (searchParams.get(key) || '').trim().slice(0, max);
    return {
      txAddress: get('txAddress', 64),
      txType: get('txType'),
      txStatus: get('txStatus', 16),
      txBefore: sanitizeCursor(searchParams.get('txBefore')),
      txAfter: sanitizeCursor(searchParams.get('txAfter')),
      postCreator: get('postCreator', 64),
      postKind: get('postKind', 16),
      postVisibility: get('postVisibility', 24),
      postBefore: sanitizeCursor(searchParams.get('postBefore')),
      postAfter: sanitizeCursor(searchParams.get('postAfter')),
      blockBefore: sanitizeCursor(searchParams.get('blockBefore')),
      blockAfter: sanitizeCursor(searchParams.get('blockAfter')),
      stakeWallet: get('stakeWallet', 64),
      stakeCreator: get('stakeCreator', 64),
      stakeStaker: get('stakeStaker', 64),
      stakeState: get('stakeState', 16),
      nftCollection: get('nftCollection', 64),
      nftOwner: get('nftOwner', 64),
      nftCreator: get('nftCreator', 64),
    };
  }, [searchParams]);

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
      return undefined;
    }

    let cancelled = false;
    setHomeState((current) => ({ ...current, loading: true, error: '' }));

    // Debounce so rapid filter changes coalesce into a single backend call.
    // The cleanup also cancels the in-flight fetch by flipping `cancelled`,
    // so its callback is a no-op even if it resolves after the next request.
    const timer = setTimeout(() => {
      fetchExplorerHome(network, filters)
        .then((data) => {
          if (cancelled) return;
          setHomeState({
            loading: false,
            error: '',
            blocks: data.blocks || [],
            transactions: data.transactions || [],
            posts: data.posts || [],
            stakes: data.stakes || [],
            nfts: data.nfts || [],
          });
        })
        .catch((error) => {
          if (cancelled) return;
          setHomeState({
            loading: false,
            error: error.message,
            blocks: [],
            transactions: [],
            posts: [],
            stakes: [],
            nfts: [],
          });
        });
    }, FILTER_FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [network, unavailable, filters]);

  const lastSearchRef = useRef('');

  async function handleSearch(event) {
    event.preventDefault();
    if (unavailable) return;

    const cleaned = sanitizeSearchQuery(query);
    if (cleaned.length < SEARCH_QUERY_MIN) {
      setSearchState({
        loading: false,
        error: `Type at least ${SEARCH_QUERY_MIN} characters to search.`,
        matches: [],
      });
      return;
    }
    // Skip identical re-submits — common when users hit Enter twice or
    // when the input still holds the last successful query.
    if (cleaned === lastSearchRef.current) return;
    lastSearchRef.current = cleaned;

    setSearchState({ loading: true, error: '', matches: [] });
    try {
      const payload = await searchExplorer(network, cleaned);
      setSearchState({
        loading: false,
        error: '',
        matches: payload.matches || [],
      });
      const next = new URLSearchParams(searchParams);
      next.set('q', cleaned);
      setSearchParams(next, { replace: true });
    } catch (error) {
      setSearchState({ loading: false, error: error.message, matches: [] });
    }
  }

  const updateFilter = useCallback(
    (name, value) => {
      const next = new URLSearchParams(searchParams);
      if (value) {
        next.set(name, value);
      } else {
        next.delete(name);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    [
      ...FILTER_FIELDS.map((f) => f.key),
      // Pagination cursors live in URL too; clearing the user's "where am I
      // looking" intent should also reset their scroll-through-time position.
      'txBefore',
      'txAfter',
      'postBefore',
      'postAfter',
      'blockBefore',
      'blockAfter',
    ].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
    toaster.info('Filters cleared.');
  }, [searchParams, setSearchParams, toaster]);

  // Apply a whole filter set from the modal in one URL update. Surfaces a
  // success banner with a quick summary of how many filters landed.
  const applyFilters = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams);
      let appliedCount = 0;
      FILTER_FIELDS.forEach((f) => {
        const v = (next[f.key] || '').trim();
        if (v) {
          params.set(f.key, v);
          appliedCount += 1;
        } else {
          params.delete(f.key);
        }
      });
      setSearchParams(params, { replace: true });
      if (appliedCount === 0) {
        toaster.info('Filters cleared — showing latest network activity.');
      } else {
        toaster.success(
          `${appliedCount} filter${appliedCount === 1 ? '' : 's'} applied. Refreshing results…`,
        );
      }
    },
    [searchParams, setSearchParams, toaster],
  );

  // Suggestion sources for each autocomplete field — drawn from what's
  // currently rendered on the page so users can one-tap fill from context.
  const pageSuggestions = useMemo(() => {
    const txAddrs = new Set();
    const txPrograms = new Set();
    homeState.transactions.forEach((t) => {
      if (t.signer) txAddrs.add(t.signer);
      if (t.primaryProgram) txPrograms.add(t.primaryProgram);
    });
    const creators = new Set(homeState.posts.map((p) => p.creator).filter(Boolean));
    const stakers = new Set(homeState.stakes.map((s) => s.staker).filter(Boolean));
    const stakeCreators = new Set(homeState.stakes.map((s) => s.creator).filter(Boolean));
    const nftOwners = new Set(homeState.nfts.map((n) => n.owner).filter(Boolean));
    const nftCreators = new Set(homeState.nfts.map((n) => n.creator).filter(Boolean));
    const nftCollections = new Set(homeState.nfts.map((n) => n.collection).filter(Boolean));
    return {
      txAddress: [...txAddrs],
      txType: [...txPrograms],
      postCreator: [...creators],
      stakeWallet: [...stakers],
      stakeCreator: [...stakeCreators],
      nftOwner: [...nftOwners],
      nftCreator: [...nftCreators],
      nftCollection: [...nftCollections],
    };
  }, [homeState]);

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
          onChange={(event) => {
            // Cap typed length up front so paste-bombs don't enter state.
            // Control chars are stripped at submit, but trimming whitespace
            // here keeps the visible value clean too.
            setQuery(event.target.value.slice(0, 100));
          }}
          placeholder="Search blocks, transactions, addresses, posts, NFTs"
          maxLength={100}
          spellCheck="false"
          autoComplete="off"
          aria-label="Explorer search"
          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-28 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-aeko-accent/50"
        />
        <button
          type="submit"
          disabled={searchState.loading}
          className="absolute right-2 top-2 bottom-2 px-5 rounded-xl bg-aeko-accent/10 hover:bg-aeko-accent/20 text-aeko-accent transition-colors disabled:opacity-50"
        >
          {searchState.loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      <ActiveFiltersBar
        filters={filters}
        onOpen={() => setFiltersOpen(true)}
        onRemove={(key) => updateFilter(key, '')}
        onClearAll={clearFilters}
      />

      <ExplorerFiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        initialFilters={filters}
        pageSuggestions={pageSuggestions}
        onApply={applyFilters}
      />

      <StatusBannerStack
        banners={[
          unavailable && {
            id: 'unavailable',
            kind: 'info',
            title: 'Explorer API not configured',
            children: `The ${networkLabel} network has no explorer API endpoint set. Switch network or configure VITE_AEKO_${network.toUpperCase()}_EXPLORER_API.`,
          },
          !unavailable && searchState.error && {
            id: 'search-error',
            kind: 'error',
            title: 'Search failed',
            children: searchState.error,
            onDismiss: () =>
              setSearchState((s) => ({ ...s, error: '' })),
          },
        ].filter(Boolean)}
      />

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

      {!unavailable && homeState.error && (
        <div className="mb-8">
          <StatusBannerStack
            banners={[
              {
                id: 'home-error',
                kind: 'error',
                title: 'Couldn’t load explorer data',
                children: homeState.error,
                onDismiss: () =>
                  setHomeState((s) => ({ ...s, error: '' })),
              },
            ]}
          />
        </div>
      )}

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
