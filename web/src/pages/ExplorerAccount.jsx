import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, FileText, ShieldCheck, Wallet } from 'lucide-react';
import NetworkToggle from '../components/NetworkToggle';
import { fetchAccountDetails, getExplorerAvailability } from '../utils/explorerApi';

export default function ExplorerAccount() {
  const { address } = useParams();
  const [network, setNetwork] = useState('testnet');
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: '', data: null });

    fetchAccountDetails(network, address)
      .then((data) => {
        if (!cancelled) {
          setState({ loading: false, error: '', data });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ loading: false, error: error.message, data: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [network, address]);

  const unavailable = !getExplorerAvailability(network);
  const detail = state.data;

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <Link to="/explorer" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Explorer
        </Link>
        <NetworkToggle value={network} onChange={setNetwork} />
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Wallet className="h-6 w-6 text-aeko-accent" />
          <h1 className="text-2xl font-bold">Account Profile</h1>
        </div>
        <p className="text-sm text-gray-400 break-all">{address}</p>
      </div>

      {unavailable ? (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-2xl p-6">
          Configure `VITE_AEKO_{network.toUpperCase()}_EXPLORER_API` to load live explorer account data.
        </div>
      ) : null}

      {!unavailable && state.loading ? (
        <div className="text-gray-400">Loading account detail...</div>
      ) : null}

      {!unavailable && state.error ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-2xl p-6">
          {state.error}
        </div>
      ) : null}

      {!unavailable && detail ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <MetricCard icon={ShieldCheck} label="Reputation" value={detail.profile.reputationScore ?? 'n/a'} />
            <MetricCard icon={Boxes} label="Token Accounts" value={detail.profile.tokenCount} />
            <MetricCard icon={FileText} label="Posts" value={detail.recentPosts.length} />
            <MetricCard icon={Wallet} label="NFTs" value={detail.profile.nftCount} />
          </div>

          <RecordPanel title="Recent Transactions" empty="No transactions indexed yet.">
            {detail.recentTransactions.map((tx) => (
              <Link
                key={tx.signature}
                to={`/explorer/tx/${tx.signature}`}
                className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0"
              >
                <span className="font-mono text-aeko-accent text-sm break-all">{tx.signature}</span>
                <span className="text-xs text-gray-400">slot {tx.slot}</span>
              </Link>
            ))}
          </RecordPanel>

          <RecordPanel title="Recent Posts" empty="No posts indexed yet.">
            {detail.recentPosts.map((post) => (
              <Link
                key={post.postId}
                to={`/explorer/post/${post.postId}`}
                className="flex items-center justify-between py-3 border-b border-white/5 last:border-b-0"
              >
                <span className="font-mono text-aeko-accent text-sm">{post.postId}</span>
                <span className="text-xs text-gray-400">{post.postKind}</span>
              </Link>
            ))}
          </RecordPanel>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-center gap-3 text-gray-400 mb-3">
        <Icon className="h-5 w-5 text-aeko-accent" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function RecordPanel({ title, empty, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h2 className="text-lg font-bold mb-4">{title}</h2>
      {items.length ? items : <div className="text-sm text-gray-500">{empty}</div>}
    </div>
  );
}
