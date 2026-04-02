import { Terminal, Code, Cpu, ShieldCheck, Boxes, Wallet, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Developers() {
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
            Tools, SDKs, validation flows, and network endpoints to accelerate real development on AEKO Chain.
          </p>
        </div>

        <div className="mb-16 bg-aeko-accent/10 border border-aeko-accent/20 rounded-2xl p-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div>
              <div className="text-sm font-medium text-aeko-accent mb-2">Phase 4 Status</div>
              <h2 className="text-2xl font-bold mb-3">Implemented in repo, not fully closed out yet</h2>
              <p className="text-gray-300 max-w-3xl">
                The identity model, wallet core, wallet-permissions program, and all four SDK surfaces are now implemented and documented.
                All four SDKs are now published. Phase 4 closes only after live wallet-core and wallet-permissions testnet validation is recorded with real on-chain signatures.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-full lg:min-w-[22rem]">
              <div className="bg-black/20 rounded-xl p-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">Repo Build State</div>
                <div className="text-white font-semibold">Implemented</div>
              </div>
              <div className="bg-black/20 rounded-xl p-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">Live Testnet Proof</div>
                <div className="text-white font-semibold">Pending</div>
              </div>
              <div className="bg-black/20 rounded-xl p-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">SDK Publication</div>
                <div className="text-white font-semibold">Complete</div>
              </div>
              <div className="bg-black/20 rounded-xl p-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">Closeout Record</div>
                <div className="text-white font-semibold">Ready to Fill</div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-6 text-sm">
            <Link to="/docs" className="inline-flex items-center gap-2 text-aeko-accent hover:text-white transition-colors">
              Open Wallet & SDK Docs <ArrowRight size={16} />
            </Link>
            <Link to="/nft-demo" className="inline-flex items-center gap-2 text-aeko-accent hover:text-white transition-colors">
              View Live AEKO-721 Demo <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* SDK Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 mb-20">
          {sdkCards.map(({ title, icon: Icon, accent, install, href, description }) => (
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
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-20">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-4">
              <Wallet className="text-aeko-accent" />
              <h2 className="text-2xl font-bold">Phase 4 Wallet Stack</h2>
            </div>
            <p className="text-gray-400 mb-6">
              AEKO's wallet stack now has an identity model, wallet core implementation, wallet-permissions program, SDK surfaces, and closeout runbooks for live testnet validation.
            </p>
            <ul className="space-y-3 text-sm text-gray-300">
              <li>Wallet core: mnemonic restore, encrypted keystore export/import, signing, stateless signing, Ledger path.</li>
              <li>Wallet permissions: delegated roles, caps, allowlists, time windows, emergency freeze, audit logging.</li>
              <li>Validation runbooks and command guides are now part of the docs set.</li>
            </ul>
            <Link to="/docs" className="inline-flex items-center gap-2 mt-6 text-aeko-accent hover:text-white transition-colors">
              Read Wallet Docs <ArrowRight size={16} />
            </Link>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="text-aeko-accent" />
              <h2 className="text-2xl font-bold">Release Readiness</h2>
            </div>
            <p className="text-gray-400 mb-6">
              The repo now includes SDK publication checklists, release steps, closeout records, and validation command guides. The remaining blocker is live wallet proof on AEKO testnet, not package release work.
            </p>
            <ul className="space-y-3 text-sm text-gray-300">
              <li>JS, Node.js, Rust, and Python package surfaces are implemented and published.</li>
              <li>Node now consumes JS through package exports instead of repo-local build paths.</li>
              <li>Phase 4 completion now depends on live wallet validation and final closeout evidence.</li>
            </ul>
            <Link to="/docs" className="inline-flex items-center gap-2 mt-6 text-aeko-accent hover:text-white transition-colors">
              Explore Developer Docs <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Network Status */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-bold mb-6">Network Endpoints</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-4 px-4 font-medium text-gray-400">Network</th>
                  <th className="py-4 px-4 font-medium text-gray-400">RPC Endpoint</th>
                  <th className="py-4 px-4 font-medium text-gray-400">WebSocket</th>
                  <th className="py-4 px-4 font-medium text-gray-400">Explorer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-4 px-4 font-bold text-green-400">Mainnet Beta</td>
                  <td className="py-4 px-4 font-mono text-sm">https://api.mainnet.aeko.chain</td>
                  <td className="py-4 px-4 font-mono text-sm">wss://api.mainnet.aeko.chain</td>
                  <td className="py-4 px-4 text-aeko-accent">explorer.aeko.chain</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-bold text-yellow-400">Testnet</td>
                  <td className="py-4 px-4 font-mono text-sm">https://api.testnet.aeko.chain</td>
                  <td className="py-4 px-4 font-mono text-sm">wss://api.testnet.aeko.chain</td>
                  <td className="py-4 px-4 text-aeko-accent">testnet.explorer.aeko.chain</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-6">
            Current developer validation and SDK examples are aligned around the AEKO testnet endpoint.
          </p>
        </div>
      </div>
    </div>
  );
}
