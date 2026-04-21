import { ExternalLink } from 'lucide-react';
import { getNetworkConfig } from '../utils/networkConfig';

export default function NetworkToolsPanel({ network }) {
  const config = getNetworkConfig(network);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">RPC</div>
        <div className="font-mono text-sm break-all text-white">{config.rpcUrl}</div>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">WebSocket</div>
        <div className="font-mono text-sm break-all text-white">{config.websocketUrl}</div>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Block Explorer</div>
        <a
          href={config.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-aeko-accent hover:text-white transition-colors text-sm break-all"
        >
          {config.explorerLabel}
          <ExternalLink size={14} />
        </a>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Faucet</div>
        {config.faucetEnabled ? (
          <div className="font-mono text-sm break-all text-white">
            {config.faucetUrl}
            <span className="ml-2 text-xs px-2 py-1 rounded bg-green-500/20 text-green-300">TCP</span>
          </div>
        ) : (
          <div className="text-sm text-gray-400">{config.faucetLabel}</div>
        )}
      </div>
    </div>
  );
}
