import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Blocks, Clock3, Hash, Layers3 } from 'lucide-react';
import NetworkToggle from '../components/NetworkToggle';
import { fetchBlockDetails, getExplorerAvailability } from '../utils/explorerApi';

export default function BlockDetails() {
  const { height } = useParams();
  const [network, setNetwork] = useState('testnet');
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: '', data: null });

    fetchBlockDetails(network, height)
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
  }, [network, height]);

  const unavailable = !getExplorerAvailability(network);
  const block = state.data;

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <Link to="/explorer" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Explorer
        </Link>
        <NetworkToggle value={network} onChange={setNetwork} />
      </div>

      {unavailable ? (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-2xl p-6">
          Configure `VITE_AEKO_{network.toUpperCase()}_EXPLORER_API` to load live block detail data.
        </div>
      ) : null}

      {!unavailable && state.loading ? <div className="text-gray-400">Loading block...</div> : null}

      {!unavailable && state.error ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-2xl p-6">
          {state.error}
        </div>
      ) : null}

      {!unavailable && block ? (
        <div className="space-y-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <Blocks className="h-6 w-6 text-aeko-accent" />
              <h1 className="text-2xl font-bold">Block #{block.slot}</h1>
            </div>
            <p className="font-mono text-sm text-gray-400 break-all">{block.blockhash}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <MetricCard icon={Layers3} label="Parent Slot" value={block.parentSlot} />
            <MetricCard icon={Hash} label="Transactions" value={block.transactionCount} />
            <MetricCard icon={Clock3} label="Timestamp" value={block.unixTimestamp ?? 'n/a'} />
            <MetricCard icon={Blocks} label="Producer" value={block.producer || 'unknown'} />
          </div>
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
      <div className="text-xl font-bold break-all">{value}</div>
    </div>
  );
}
