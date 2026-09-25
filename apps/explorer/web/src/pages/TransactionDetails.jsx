import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, CheckCircle2, Wallet, XCircle } from 'lucide-react';
import NetworkToggle from '../components/NetworkToggle';
import { useNetwork } from '../components/NetworkContext';
import { fetchTransactionDetails, getExplorerAvailability } from '../utils/explorerApi';

export default function TransactionDetails() {
  const { hash } = useParams();
  const { network } = useNetwork();
  const requestKey = `${network}:${hash}`;
  const [state, setState] = useState({ requestKey: '', error: '', data: null });

  useEffect(() => {
    let cancelled = false;

    fetchTransactionDetails(network, hash)
      .then((data) => {
        if (!cancelled) {
          setState({ requestKey, error: '', data });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ requestKey, error: error.message, data: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [network, hash, requestKey]);

  const unavailable = !getExplorerAvailability(network);
  const requestCurrent = state.requestKey === requestKey;
  const loading = !requestCurrent;
  const tx = requestCurrent ? state.data : null;

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <Link to="/explorer" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Explorer
        </Link>
        <NetworkToggle />
      </div>

      {unavailable ? (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-2xl p-6">
          Explorer API not configured for {network}.
        </div>
      ) : null}

      {!unavailable && loading ? <div className="text-gray-400">Loading transaction...</div> : null}

      {!unavailable && requestCurrent && state.error ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-2xl p-6">
          {state.error}
        </div>
      ) : null}

      {!unavailable && tx ? (
        <div className="space-y-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Activity className="h-6 w-6 text-aeko-accent" />
                  <h1 className="text-2xl font-bold">Transaction</h1>
                </div>
                <p className="font-mono text-sm text-gray-400 break-all">{tx.signature}</p>
              </div>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${tx.success ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                {tx.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {tx.success ? 'Success' : 'Failed'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <MetricCard label="Slot" value={tx.slot} />
            <MetricCard label="Fee" value={tx.fee} />
            <MetricCard label="Program" value={tx.primaryProgram || 'unknown'} />
            <MetricCard label="Signer" value={tx.signer || 'unknown'} icon={Wallet} />
          </div>

          {tx.signer ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">Related Links</h2>
              <Link to={`/explorer/account/${tx.signer}`} className="text-aeko-accent hover:text-white transition-colors break-all">
                Open signer account profile
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon = null, label, value }) {
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
