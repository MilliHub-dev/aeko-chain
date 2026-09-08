import { Droplets, FlaskConical, Network, Terminal, WalletCards } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import NetworkToggle from '../components/NetworkToggle';
import NetworkToolsPanel from '../components/NetworkToolsPanel';
import NetworkConsoleModal from '../components/NetworkConsoleModal';
import { getNetworkConfig } from '../utils/networkConfig';

const CONSOLE_TABS = new Set(['accounts', 'programs', 'social']);

export default function Faucet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedNetwork = searchParams.get('network');
  const network = requestedNetwork === 'mainnet' ? 'mainnet' : 'testnet';
  const config = getNetworkConfig(network);
  const consoleOpen = searchParams.get('console') === '1';
  const requestedTab = searchParams.get('tab');
  const consoleTab = CONSOLE_TABS.has(requestedTab) ? requestedTab : 'accounts';

  // Local-dev override: setting VITE_AEKO_LOCAL_RPC in web/.env.local lets the
  // console target a port-forwarded validator without changing public links.
  const modalRpc =
    network === 'testnet' && import.meta.env.VITE_AEKO_LOCAL_RPC
      ? import.meta.env.VITE_AEKO_LOCAL_RPC
      : config.rpcUrl;

  const updateParams = (updates, { replace = false } = {}) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace });
  };

  const setNetwork = (nextNetwork) => {
    updateParams({ network: nextNetwork === 'testnet' ? null : nextNetwork });
  };

  const openConsole = (tab = 'accounts') => {
    updateParams({ console: '1', tab });
  };

  const closeConsole = () => {
    updateParams({ console: null, tab: null });
  };

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
        <div>
          <div className="text-sm font-medium text-aeko-accent mb-2">Developer Network Workspace</div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Network Tools</h1>
          <p className="text-xl text-gray-400 max-w-3xl">
            Inspect AEKO endpoints, manage testnet wallets, fund accounts, send transactions,
            verify native SocialFi state, and exercise the on-chain social timeline from one place.
          </p>
        </div>
        <NetworkToggle value={network} onChange={setNetwork} />
      </div>

      <div className="mb-10">
        <NetworkToolsPanel network={network} />
      </div>

      {network === 'testnet' && (
        <div className="mb-10 rounded-2xl border border-aeko-accent/40 bg-gradient-to-br from-aeko-accent/10 via-white/[0.02] to-transparent p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-11 h-11 rounded-xl bg-aeko-accent/15 border border-aeko-accent/30 flex items-center justify-center">
                <FlaskConical className="text-aeko-accent" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-1">AEKO Network Console</h2>
                <p className="text-sm text-gray-400 max-w-2xl">
                  A URL-addressable testnet workspace for account funding, transfers, live
                  SocialFi bootstrap verification, real signed Social actions, and end-to-end acceptance checks.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openConsole('accounts')}
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-aeko-accent text-black text-sm font-semibold hover:brightness-110 transition shrink-0"
            >
              <WalletCards size={16} />
              Open network console
            </button>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <button type="button" onClick={() => openConsole('accounts')} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left hover:bg-white/5 transition">
              <div className="text-sm font-medium text-white">Accounts</div>
              <div className="mt-1 text-xs text-gray-500">Wallets, balances, airdrops, transfers</div>
            </button>
            <button type="button" onClick={() => openConsole('programs')} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left hover:bg-white/5 transition">
              <div className="text-sm font-medium text-white">Programs</div>
              <div className="mt-1 text-xs text-gray-500">Live status for all five native SocialFi states</div>
            </button>
            <button type="button" onClick={() => openConsole('social')} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left hover:bg-white/5 transition">
              <div className="text-sm font-medium text-white">Social</div>
              <div className="mt-1 text-xs text-gray-500">Timeline, profiles, posts, replies, likes</div>
            </button>
            <Link to="/network-tools/social-e2e" className="rounded-xl border border-aeko-accent/25 bg-aeko-accent/[0.06] px-4 py-3 text-left hover:bg-aeko-accent/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70">
              <div className="text-sm font-medium text-aeko-accent">Social E2E</div>
              <div className="mt-1 text-xs text-gray-500">Sign, submit, confirm, index, and read the full SocialFi flow</div>
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <Network className="text-aeko-accent" />
            <h2 className="text-2xl font-bold">{config.label} access</h2>
          </div>
          <p className="text-gray-400 mb-6">
            {network === 'testnet'
              ? 'Use the validator RPC for wallet funding and test transactions. The internal faucet daemon remains a deployment service, not this public page.'
              : 'Mainnet does not expose test funding. Use your normal treasury, exchange, or operational distribution flow.'}
          </p>

          {network === 'testnet' ? (
            <div className="rounded-xl border border-white/15 bg-black/20 p-5">
              <div className="text-sm font-medium text-white mb-1">Test funding path</div>
              <div className="text-sm text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                requestAirdrop through validator RPC
              </div>
              <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-white/10">
                The raw TCP faucet is internal infrastructure. Users and SDKs request funds through
                the RPC, which keeps the public terminology distinct from the daemon itself.
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
            <h2 className="text-2xl font-bold">CLI flow</h2>
          </div>
          <p className="text-gray-400 mb-4">
            Use the AEKO CLI for deterministic account funding, validator testing, and scripted SDK validation.
          </p>
          <pre className="bg-black/40 rounded-xl p-4 overflow-x-auto text-sm text-gray-300">
            <code>{`aeko config set --url ${config.rpcUrl}\naeko airdrop 10 <recipient-address> --url ${config.cliCluster}`}</code>
          </pre>
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
            <Droplets size={13} /> Airdrop transactions created in the console link directly to Aeko Scan.
          </div>
        </div>
      </div>

      <NetworkConsoleModal
        open={consoleOpen}
        onClose={closeConsole}
        tab={consoleTab}
        onTabChange={(tab) => updateParams({ console: '1', tab })}
        rpcUrl={modalRpc}
        network={config.label}
        explorerApiUrl={config.explorerApiUrl}
        explorerUrl={config.explorerUrl}
      />
    </div>
  );
}
