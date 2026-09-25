import { ExternalLink } from 'lucide-react';
import { getNetworkConfig } from '../utils/networkConfig';

function EndpointValue({ value }) {
  return <div className="font-mono text-sm break-all text-white">{value || 'Not configured'}</div>;
}

export default function NetworkToolsPanel({ network }) {
  const config = getNetworkConfig(network);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">App connection</div>
        <EndpointValue value={config.rpcUrl} />
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Live updates</div>
        <EndpointValue value={config.websocketUrl} />
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Block Explorer</div>
        {config.explorerUrl ? (
          <a
            href={config.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-aeko-accent hover:text-white transition-colors text-sm break-all"
          >
            {config.explorerLabel}
            <ExternalLink size={14} />
          </a>
        ) : (
          <div className="text-sm text-gray-400">Not configured</div>
        )}
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Test funding</div>
        {config.fundingEnabled ? (
          <a
            href={config.fundingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-aeko-accent hover:text-white transition-colors text-sm break-all"
          >
            {new URL(config.fundingUrl).host}
            <ExternalLink size={14} />
          </a>
        ) : (
          <div className="text-sm text-gray-400">{config.fundingLabel}</div>
        )}
      </div>
    </div>
  );
}
