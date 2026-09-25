import { Terminal, Code, Cpu, Boxes, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import NetworkToggle from '../components/NetworkToggle';
import { useNetwork } from '../components/NetworkContext';
import NetworkToolsPanel from '../components/NetworkToolsPanel';
import { getNetworkConfig } from '../utils/networkConfig';
import { useAppSettings } from '../components/AppSettingsContext';

export default function Developers() {
  const { settings } = useAppSettings();
  // Global selection: developer surfaces follow the shared toggle.
  const { network, testSurfacesVisible } = useNetwork();
  const activeNetwork = getNetworkConfig(network);
  const sdkCards = [
    {
      title: 'Rust Client SDK',
      icon: Code,
      accent: 'text-orange-500',
      install: 'cargo add aeko-rust-sdk',
      href: 'https://crates.io/crates/aeko-rust-sdk',
      description: 'Off-chain Rust client for async RPC, typed AEKO-721 reads, wallet-permissions builders, and high-performance app services.',
    },
    {
      title: 'JavaScript SDK',
      icon: Terminal,
      accent: 'text-blue-500',
      install: 'npm install @aeko-chain/web3.js',
      href: 'https://www.npmjs.com/package/@aeko-chain/web3.js',
      description: 'Frontend-first package with RPC, wallet adapter helpers, AEKO-721 builders, wallet-permissions builders, and websocket subscriptions.',
    },
    {
      title: 'Node.js SDK',
      icon: Boxes,
      accent: 'text-cyan-400',
      install: 'npm install @aeko-chain/sdk',
      href: 'https://www.npmjs.com/package/@aeko-chain/sdk',
      description: 'Backend package for server-side signing, batch transaction workflows, and webhook-style listeners built on the JS package boundary.',
    },
    {
      title: 'Python SDK',
      icon: Cpu,
      accent: 'text-green-500',
      install: 'pip install aeko-sdk',
      href: 'https://pypi.org/project/aeko-sdk/',
      description: 'Stdlib-first package for scripting, monitoring, analytics, AEKO-721 reads, and wallet-permissions instruction planning.',
    },
  ];

  return (
    <div className="pt-20 pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">Developer Resources</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            SDKs, guides, and network endpoints to accelerate real development on AEKO Chain.
          </p>
        </div>

        {/* SDK Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 mb-20">
          {sdkCards.map(({ title, icon, accent, install, href, description }) => {
            const Icon = icon;
            return (
            <div key={title} className="bg-[#0f0f16] border border-white/10 rounded-xl p-8 hover:border-aeko-accent/50 transition-colors">
              <div className={`w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 ${accent}`}>
                <Icon size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">{title}</h3>
              <p className="text-gray-400 mb-6 text-sm leading-relaxed">{description}</p>
              <div className="bg-black/30 p-3 rounded font-mono text-sm text-gray-300 break-all">
                {install}
              </div>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-aeko-accent hover:text-white transition-colors text-sm"
              >
                View Published Package <ArrowRight size={16} />
              </a>
            </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-20">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-4">
              <Code className="text-aeko-accent" />
              <h2 className="text-2xl font-bold">Build Smart Contracts</h2>
            </div>
            <p className="text-gray-400 mb-6">
              Go from zero to first AEKO program with a starter contract,
              a Rust toolchain path, and a full deploy-and-invoke walkthrough.
            </p>
            <ul className="space-y-3 text-sm text-gray-300">
              <li>Starter contract template under <span className="font-mono">contracts/hello-aeko-program</span>.</li>
              <li>Write-your-first-program docs for the AEKO program model and build flow.</li>
              <li>Deploy-and-invoke guide for a first live contract interaction.</li>
            </ul>
            <Link to="/docs" className="inline-flex items-center gap-2 mt-6 text-aeko-accent hover:text-white transition-colors">
              Open Smart Contract Guides <ArrowRight size={16} />
            </Link>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-4">
              <Boxes className="text-aeko-accent" />
              <h2 className="text-2xl font-bold">Aeko Social Backend Flow</h2>
            </div>
            <p className="text-gray-400 mb-6">
              The Node SDK includes reusable backend helpers for deterministic post hashing,
              Ed25519 signature verification, post anchor transaction preparation, and persisted
              verification state for Aeko Social integrations.
            </p>
            <ul className="space-y-3 text-sm text-gray-300">
              <li>Canonical post payload and hash helpers for backend services.</li>
              <li>Reusable verification service and store adapter for real app integration.</li>
              <li>Reference HTTP backend for hash, verify, anchor, and verification lookup flows.</li>
            </ul>
            <Link to="/docs" className="inline-flex items-center gap-2 mt-6 text-aeko-accent hover:text-white transition-colors">
              Read Backend Integration Docs <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {settings.nftDemoEnabled && testSurfacesVisible ? (
          <div className="mb-20 bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">NTF Lifecycle</h2>
              <p className="text-sm text-gray-400">
                Create, mint, freeze, thaw, update, and transfer real on-chain assets, then verify state through RPC and the Explorer indexer.
              </p>
            </div>
            <Link to="/ntf" className="inline-flex items-center gap-2 text-aeko-accent hover:text-white transition-colors shrink-0">
              Open NTF <ArrowRight size={16} />
            </Link>
          </div>
        ) : null}

        {/* Network Status */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Network Endpoints</h2>
              <p className="text-sm text-gray-400">
                Switch between clusters to view the right explorer, funding, and API endpoints for
                the current environment.
              </p>
            </div>
            <NetworkToggle />
          </div>
          <NetworkToolsPanel network={network} />
          <p className="text-sm text-gray-500 mt-6">
            Current selection: {activeNetwork.label}. Wallet validation examples still default to
            testnet unless you override the RPC environment variables.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Explorer web pages now also support backend-driven reads when you configure
            the explorer API URLs.
          </p>
        </div>
      </div>
    </div>
  );
}
