import { useState } from 'react';
import { Droplets, Terminal, FlaskConical } from 'lucide-react';
import NetworkToggle from '../components/NetworkToggle';
import NetworkToolsPanel from '../components/NetworkToolsPanel';
import FaucetTestModal from '../components/FaucetTestModal';
import { getNetworkConfig } from '../utils/networkConfig';

export default function Faucet() {
  const [network, setNetwork] = useState('testnet');
  const [testOpen, setTestOpen] = useState(false);
  const config = getNetworkConfig(network);

  // Local-dev override: setting VITE_AEKO_LOCAL_RPC in web/.env.local lets you
  // point the modal at http://localhost:8899 while keeping the rest of the
  // page on the public testnet — useful when port-forwarding the validator
  // container during `npm run dev` against a Coolify deployment.
  const modalRpc =
    network === 'testnet' && import.meta.env.VITE_AEKO_LOCAL_RPC
      ? import.meta.env.VITE_AEKO_LOCAL_RPC
      : config.rpcUrl;

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
        <div>
          <div className="text-sm font-medium text-aeko-accent mb-2">Network Tools</div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Faucet & Access</h1>
          <p className="text-xl text-gray-400 max-w-3xl">
            Switch between testnet and mainnet to see the right explorer, RPC, WebSocket, and
            faucet entry points for AEKO Chain.
          </p>
        </div>
        <NetworkToggle value={network} onChange={setNetwork} />
      </div>

      <div className="mb-10">
        <NetworkToolsPanel network={network} />
      </div>

      {network === 'testnet' && (
        <div className="mb-10 rounded-2xl border border-aeko-accent/40 bg-gradient-to-br from-aeko-accent/10 via-white/[0.02] to-transparent p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-11 h-11 rounded-xl bg-aeko-accent/15 border border-aeko-accent/30 flex items-center justify-center">
              <FlaskConical className="text-aeko-accent" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-1">Test console</h2>
              <p className="text-sm text-gray-400 max-w-xl">
                Spin up in-browser test wallets, request faucet airdrops, transfer between
                wallets, and probe the five SocialFi native builtins — without leaving this page.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-aeko-accent text-black text-sm font-semibold hover:brightness-110 transition shrink-0"
          >
            <FlaskConical size={16} />
            Open test console
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <Droplets className="text-aeko-accent" />
            <h2 className="text-2xl font-bold">{config.label} Faucet</h2>
          </div>
          <p className="text-gray-400 mb-6">
            {network === 'testnet'
              ? 'Use the faucet for low-risk wallet funding, transaction testing, SDK validation, and wallet-core closeout flows.'
              : 'Mainnet does not expose a public faucet. Fund wallets through your exchange, treasury, or operational distribution flow.'}
          </p>

          {config.faucetEnabled ? (
            <div className="rounded-xl border border-white/15 bg-black/20 p-5">
              <div className="text-sm font-medium text-white mb-1">Status</div>
              <div className="text-sm text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                Active and Listening
              </div>
              <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-white/10">
                Note: The faucet daemon runs on a raw TCP socket, not HTTP. Use the CLI commands below to interact with it.
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-gray-400">
              {config.faucetLabel}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <Terminal className="text-aeko-accent" />
            <h2 className="text-2xl font-bold">CLI Flow</h2>
          </div>
          <p className="text-gray-400 mb-4">
            Use the AEKO CLI when you want deterministic funding for wallets, validator testing,
            and scripted SDK validation.
          </p>
          <pre className="bg-black/40 rounded-xl p-4 overflow-x-auto text-sm text-gray-300">
            <code>{`aeko config set --url ${config.rpcUrl}
aeko airdrop 10 <recipient-address> --url ${config.cliCluster}`}</code>
          </pre>
        </div>
      </div>

      <FaucetTestModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        rpcUrl={modalRpc}
        network={config.label}
        explorerApiUrl={config.explorerApiUrl}
      />
    </div>
  );
}
