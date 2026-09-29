import { Activity, Braces, Radio, WalletCards, Waypoints } from 'lucide-react';
import { Link } from 'react-router-dom';
import CopyButton from './CopyButton';
import { getNetworkConfig } from '../utils/networkConfig';

function EndpointCard({ label, value, icon, hint }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </div>
      {value ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-gray-200">
            <span className="block truncate" title={value}>{value}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-xs text-gray-500">{hint}</span>
            <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
          </div>
        </div>
      ) : (
        <div className="text-sm font-medium text-gray-500">Not configured</div>
      )}
    </div>
  );
}

export default function NetworkToolsPanel({ network }) {
  const config = getNetworkConfig(network);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <EndpointCard
        label="RPC endpoint"
        value={config.rpcUrl}
        icon={<Waypoints size={14} />}
        hint="CLI and SDK requests"
      />
      <EndpointCard
        label="Realtime endpoint"
        value={config.websocketUrl}
        icon={<Radio size={14} />}
        hint="Subscriptions and live updates"
      />
      <EndpointCard
        label="Explorer API"
        value={config.explorerApiUrl}
        icon={<Braces size={14} />}
        hint="Indexed application data"
      />

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
          <Activity size={14} />
          Aeko Scan
        </div>
        <Link
          to="/explorer"
          className="inline-flex min-h-11 items-center text-sm font-medium text-aeko-accent transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
        >
          Open explorer
        </Link>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
          <WalletCards size={14} />
          AEKO funding
        </div>
        {config.fundingEnabled ? (
          <div className="text-sm font-medium text-green-300">
            Funding workflow available below
          </div>
        ) : (
          <div className="text-sm font-medium text-gray-500">Funding is not configured</div>
        )}
      </div>
    </div>
  );
}
