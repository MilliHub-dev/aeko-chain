import { Terminal, Code, Cpu } from 'lucide-react';

export default function Developers() {
  return (
    <div className="pt-20 pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">Developer Resources</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Tools, SDKs, and APIs to accelerate your development on AEKO Chain.
          </p>
        </div>

        {/* SDK Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div className="bg-[#0f0f16] border border-white/10 rounded-xl p-8 text-center hover:border-aeko-accent/50 transition-colors">
            <div className="w-16 h-16 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-6 text-orange-500">
              <Code size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2">Rust SDK</h3>
            <p className="text-gray-400 mb-6">Build high-performance native programs using the standard AEKO crate.</p>
            <div className="bg-black/30 p-3 rounded font-mono text-sm text-gray-300">
              cargo add aeko-sdk
            </div>
          </div>

          <div className="bg-[#0f0f16] border border-white/10 rounded-xl p-8 text-center hover:border-aeko-accent/50 transition-colors">
            <div className="w-16 h-16 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-6 text-blue-500">
              <Terminal size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2">TypeScript SDK</h3>
            <p className="text-gray-400 mb-6">Interact with the chain from your web or Node.js applications.</p>
            <div className="bg-black/30 p-3 rounded font-mono text-sm text-gray-300">
              npm install @aeko/web3
            </div>
          </div>

          <div className="bg-[#0f0f16] border border-white/10 rounded-xl p-8 text-center hover:border-aeko-accent/50 transition-colors">
            <div className="w-16 h-16 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-6 text-green-500">
              <Cpu size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2">CLI Tools</h3>
            <p className="text-gray-400 mb-6">Manage wallets, deploy programs, and monitor the network.</p>
            <div className="bg-black/30 p-3 rounded font-mono text-sm text-gray-300">
              sh -c "$(curl -sSfL aeko.sh)"
            </div>
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
        </div>
      </div>
    </div>
  );
}
