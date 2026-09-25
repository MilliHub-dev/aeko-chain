import { Droplets, FlaskConical, Network, Terminal, WalletCards } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import NetworkToggle from '../components/NetworkToggle';
import NetworkToolsPanel from '../components/NetworkToolsPanel';
import TestnetFundingRequest from '../components/TestnetFundingRequest';
import NetworkConsoleModal from '../components/NetworkConsoleModal';
import NetworkSocialModal from '../components/social/NetworkSocialModal';
import { getNetworkConfig, isTestSurfaceNetwork } from '../utils/networkConfig';
import { useAppSettings } from '../components/AppSettingsContext';
import { useNetwork } from '../components/NetworkContext';

const CONSOLE_TABS = new Set(['accounts', 'programs', 'social']);
const SOCIAL_QUERY_KEYS = ['social', 'profile', 'post', 'dialog', 'target', 'persona'];

function isLoopbackUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

// Essential CLI quick commands for the selected network. Cluster selection
// always shows the exact endpoint first: monikers exist only where the CLI
// defines them (`localhost` for loopback, `testnet` resolved by the CLI via
// AEKO_TESTNET_RPC_URL) — mainnet has no moniker and needs the explicit URL.
function developerQuickCommands(config) {
  const rpc = config.rpcUrl || '<rpc-url>';
  const cluster = [];
  if (config.key === 'localnet' && isLoopbackUrl(config.rpcUrl)) {
    cluster.push('aeko config set --url localhost');
  } else {
    cluster.push(`aeko config set --url ${rpc}`);
  }
  if (config.key === 'testnet') {
    cluster.push('# alias (CLI resolves it via AEKO_TESTNET_RPC_URL): aeko config set --url testnet');
  }
  if (config.key === 'mainnet') {
    cluster.push('# mainnet has no moniker — always use the explicit URL above');
  }

  const wallets = [
    'aeko-keygen new --outfile ~/.config/aeko/id.json',
    'aeko balance <wallet-address>',
    'aeko transfer <recipient-address> <amount>',
  ];

  // Airdrops always go through the CLI, which talks to the validator RPC
  // directly — no API involved, no approval step. The Funding Portal is only
  // for special cases that need operator approval — never the default path.
  let funding;
  if (config.key === 'localnet') {
    funding = [
      'aeko airdrop 10 <recipient-address>',
    ];
  } else if (config.key === 'testnet') {
    funding = [
      'aeko airdrop <amount> <recipient-address>',
    ];
  } else {
    funding = ['# no airdrops on mainnet — use treasury or exchange distribution'];
  }

  const programs = [
    'aeko program deploy <program-binary>',
    'aeko program close <program-id>',
  ];

  return [
    { title: 'Select cluster', lines: cluster },
    { title: 'Wallets', lines: wallets },
    { title: 'Funding', lines: funding },
    { title: 'Programs', lines: programs },
  ];
}

export default function NetworkTools() {
  const { settings } = useAppSettings();
  const { network } = useNetwork();
  const [searchParams, setSearchParams] = useSearchParams();
  // Global selection: the Test Console below stays pinned to test-only
  // networks (testnet/localnet) and never renders on mainnet, regardless of
  // API visibility flags.
  const config = getNetworkConfig(network);
  const isTestNetwork = isTestSurfaceNetwork(network);
  const consoleOpen = isTestNetwork && settings.networkConsoleEnabled && searchParams.get('console') === '1';
  const requestedTab = searchParams.get('tab');
  const consoleTab = CONSOLE_TABS.has(requestedTab) ? requestedTab : 'accounts';

  const modalRpc = config.rpcUrl;

  const updateParams = (updates, { replace = false, remove = [] } = {}) => {
    const next = new URLSearchParams(searchParams);
    remove.forEach((key) => next.delete(key));
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace });
  };

  const openConsole = (tab = 'accounts') => {
    if (!settings.networkConsoleEnabled) return;
    const updates = { console: '1', tab };
    if (tab === 'social' && !searchParams.get('social')) updates.social = 'feed';
    updateParams(updates, { remove: tab === 'social' ? [] : SOCIAL_QUERY_KEYS });
  };

  const closeConsole = () => {
    updateParams(
      { console: null, tab: null },
      { remove: SOCIAL_QUERY_KEYS },
    );
  };

  const switchConsoleTab = (tab) => {
    const updates = { console: '1', tab };
    if (tab === 'social') updates.social = searchParams.get('social') || 'feed';
    updateParams(updates, { remove: tab === 'social' ? [] : SOCIAL_QUERY_KEYS });
  };

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
        <div>
          <div className="text-sm font-medium text-aeko-accent mb-2">Developer Network Workspace</div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Network Tools</h1>
          <p className="text-xl text-gray-400 max-w-3xl">
            Inspect AEKO endpoints, request testnet funding, manage test wallets, send transactions,
            verify native SocialFi state, and exercise the on-chain social timeline from one place.
          </p>
        </div>
        <NetworkToggle />
      </div>

      <div className="mb-10">
        <NetworkToolsPanel network={network} />
      </div>

      {isTestNetwork ? (
        <TestnetFundingRequest fundingUrl={config.fundingUrl} />
      ) : null}

      {isTestNetwork && settings.networkConsoleEnabled && (
        <div className="mb-10 rounded-2xl border border-aeko-accent/40 bg-gradient-to-br from-aeko-accent/10 via-white/[0.02] to-transparent p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-11 h-11 rounded-xl bg-aeko-accent/15 border border-aeko-accent/30 flex items-center justify-center">
                <FlaskConical className="text-aeko-accent" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-1">AEKO Network Console</h2>
                <p className="text-sm text-gray-400 max-w-2xl">
                  A URL-addressable testnet workspace for wallet management, transfers, live
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
              <div className="mt-1 text-xs text-gray-500">Wallets, balances, transfers</div>
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
            {isTestNetwork
              ? config.key === 'localnet'
                ? 'Local development can use requestAirdrop directly on the local validator RPC.'
                : 'Use the Testnet Funding Portal to submit a public funding request for operator approval. The Network Console has a separate constrained developer airdrop flow. The private Faucet Daemon remains internal infrastructure, and the public RPC does not accept unauthenticated requestAirdrop calls.'
              : 'Mainnet does not expose test funding. Use your normal treasury, exchange, or operational distribution flow.'}
          </p>

          {isTestNetwork ? (
            <div className="rounded-xl border border-white/15 bg-black/20 p-5">
              <div className="text-sm font-medium text-white mb-1">Public funding path</div>
              <div className="text-sm text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Policy-controlled Funding Gateway
              </div>
              <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-white/10">
                The Faucet Daemon is a private TCP service. Public users submit funding requests through
                the Funding Portal and an operator approves release; only server-side funding routes are authorized to invoke requestAirdrop.
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-gray-400">
              {config.fundingLabel}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <Terminal className="text-aeko-accent" />
            <h2 className="text-2xl font-bold">Developer flow</h2>
          </div>
          <p className="text-gray-400 mb-4">
            Use the AEKO CLI to select the active cluster, inspect balances, transfer AEKO, deploy programs, and run scripted validation. Testnet funding stays in the Funding Portal above.
          </p>
          <div className="space-y-3">
            {developerQuickCommands(config).map((section) => (
              <div key={section.title}>
                <div className="text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-1.5">{section.title}</div>
                <pre className="bg-black/40 rounded-xl p-4 overflow-x-auto text-sm text-gray-300">
                  <code>{section.lines.join('\n')}</code>
                </pre>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
            <Droplets size={13} /> Funding grants and test transactions link directly to Aeko Scan.
          </div>
        </div>
      </div>

      {settings.networkConsoleEnabled && consoleOpen && consoleTab === 'social' ? (
        <NetworkSocialModal network={network} onClose={closeConsole} />
      ) : (
        <NetworkConsoleModal
          open={settings.networkConsoleEnabled && consoleOpen}
          onClose={closeConsole}
          tab={consoleTab}
          onTabChange={switchConsoleTab}
          rpcUrl={modalRpc}
          network={config.label}
          explorerApiUrl={config.explorerApiUrl}
          explorerUrl={config.explorerUrl}
          fundingUrl={config.fundingUrl}
        />
      )}
    </div>
  );
}
