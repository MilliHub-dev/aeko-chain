import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Coins, Users, Repeat2 } from 'lucide-react';
import NetworkToggle from '../components/NetworkToggle';
import { fetchTokenDetails, getExplorerAvailability } from '../utils/explorerApi';

export default function ExplorerToken() {
  const { mint } = useParams();
  const [network, setNetwork] = useState('testnet');
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: '', data: null });

    fetchTokenDetails(network, mint)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: '', data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error.message, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [network, mint]);

  const unavailable = !getExplorerAvailability(network);
  const token = state.data;

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <Link to="/explorer" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Explorer
        </Link>
        <NetworkToggle value={network} onChange={setNetwork} />
      </div>

      {unavailable ? (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-2xl p-6">
          Configure `VITE_AEKO_{network.toUpperCase()}_EXPLORER_API` to load live token detail data.
        </div>
      ) : null}

      {!unavailable && state.loading ? <div className="text-gray-400">Loading token...</div> : null}
      {!unavailable && state.error ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-2xl p-6">
          {state.error}
        </div>
      ) : null}

      {!unavailable && token ? (
        <div className="space-y-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <Coins className="h-6 w-6 text-aeko-accent" />
              <h1 className="text-2xl font-bold">AEKO-20 Token</h1>
            </div>
            <p className="font-mono text-sm text-gray-400 break-all">{token.mint}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Metric icon={Users} label="Holders" value={token.holderCount} />
            <Metric icon={Coins} label="Snapshot Supply" value={token.totalSupply} />
            <Metric icon={Repeat2} label="Indexed Transfers" value={token.recentTransfers.length} />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">Recent Snapshot Transfers</h2>
            <div className="space-y-3">
              {token.recentTransfers.map((transfer) => (
                <div key={`${transfer.signature}-${transfer.destination}`} className="py-3 border-b border-white/5 last:border-b-0">
                  <div className="font-mono text-aeko-accent text-sm break-all">{transfer.signature}</div>
                  <div className="text-xs text-gray-500 break-all mt-1">
                    {transfer.source} → {transfer.destination}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{transfer.amount}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-center gap-3 text-gray-400 mb-3">
        {Icon ? <Icon className="h-5 w-5 text-aeko-accent" /> : null}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-xl font-bold break-all">{value}</div>
    </div>
  );
}
