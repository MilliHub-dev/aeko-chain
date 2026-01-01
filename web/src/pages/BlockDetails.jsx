import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Box, Clock, Shield, Database, Hash, ArrowRight } from 'lucide-react';

const BlockDetails = () => {
  const { height } = useParams();

  // Mock Data
  const blockData = {
    height: height || '14205891',
    hash: '0x3b...8a9c2d1e4f5g6h7i8j9k0l1m2n3o4p',
    timestamp: '2025-05-15 14:30:22 UTC',
    proposer: 'Aeko Validator 1',
    txCount: 4520,
    size: '1.2 MB',
    parentHash: '0x2a...7b8c1d0e3f4g5h6i7j8k9l0m1n2o3p',
    rewards: '4.2 AEKO'
  };

  const blockTxs = [
    { hash: '0x7f...3a21', type: 'Transfer', from: '0x1a...9b2c', to: '0x4d...1e2f', value: '150 AEKO', fee: '0.0004' },
    { hash: '0x2b...9c8d', type: 'Contract Call', from: '0x8e...5f6a', to: 'Aeko Swap', value: '0 AEKO', fee: '0.0012' },
    { hash: '0x9c...1d4e', type: 'NFT Mint', from: '0x3f...2a1b', to: 'Creator Drop', value: '50 AEKO', fee: '0.0008' },
    { hash: '0x5a...8b9c', type: 'Social Post', from: '0x7c...4d3e', to: 'Social Graph', value: '0.01 AEKO', fee: '0.0001' },
    { hash: '0x1d...6e7f', type: 'Delegate', from: '0x2b...8a9c', to: 'Validator 1', value: '1000 AEKO', fee: '0.0005' },
  ];

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <Link to="/explorer" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Explorer
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Block Header */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <Box className="h-6 w-6 text-aeko-accent" />
                Block #{blockData.height}
              </h1>
              <div className="flex items-center gap-2 mt-2 text-gray-400 font-mono text-sm break-all">
                {blockData.hash}
              </div>
            </div>
            <div className="flex gap-4">
                <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm">
                    <ArrowLeft className="h-4 w-4" /> Prev
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm">
                    Next <ArrowRight className="h-4 w-4" />
                </button>
            </div>
          </div>
        </div>

        {/* Block Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 text-gray-400 mb-2">
                    <Clock className="h-5 w-5 text-aeko-accent" />
                    <span className="text-sm font-medium">Timestamp</span>
                </div>
                <div className="text-white font-bold">{blockData.timestamp}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 text-gray-400 mb-2">
                    <Database className="h-5 w-5 text-aeko-accent" />
                    <span className="text-sm font-medium">Transactions</span>
                </div>
                <div className="text-white font-bold">{blockData.txCount}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 text-gray-400 mb-2">
                    <Shield className="h-5 w-5 text-aeko-accent" />
                    <span className="text-sm font-medium">Proposer</span>
                </div>
                <div className="text-white font-bold text-sm truncate">{blockData.proposer}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 text-gray-400 mb-2">
                    <Hash className="h-5 w-5 text-aeko-accent" />
                    <span className="text-sm font-medium">Size</span>
                </div>
                <div className="text-white font-bold">{blockData.size}</div>
            </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 bg-white/5">
                <h2 className="text-lg font-bold">Block Transactions</h2>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="border-b border-white/10 text-xs text-gray-400 uppercase tracking-wider">
                        <th className="py-4 px-6 font-medium">Tx Hash</th>
                        <th className="py-4 px-6 font-medium">Type</th>
                        <th className="py-4 px-6 font-medium">From</th>
                        <th className="py-4 px-6 font-medium">To</th>
                        <th className="py-4 px-6 font-medium text-right">Value</th>
                        <th className="py-4 px-6 font-medium text-right">Fee</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5 text-sm">
                    {blockTxs.map((tx) => (
                        <tr key={tx.hash} className="hover:bg-white/5 transition-colors">
                            <td className="py-4 px-6 font-mono text-aeko-accent hover:underline cursor-pointer">
                                <Link to={`/explorer/tx/${tx.hash}`}>{tx.hash}</Link>
                            </td>
                            <td className="py-4 px-6">
                                <span className="bg-white/10 px-2 py-1 rounded text-xs text-gray-300">{tx.type}</span>
                            </td>
                            <td className="py-4 px-6 font-mono text-gray-300 truncate max-w-[150px]">{tx.from}</td>
                            <td className="py-4 px-6 font-mono text-gray-300 truncate max-w-[150px]">{tx.to}</td>
                            <td className="py-4 px-6 text-right font-medium text-white">{tx.value}</td>
                            <td className="py-4 px-6 text-right text-gray-400">{tx.fee}</td>
                        </tr>
                    ))}
                 </tbody>
               </table>
            </div>
             <div className="p-4 text-center border-t border-white/10">
                <button className="py-2 text-sm text-gray-400 hover:text-white transition-colors">
                  View All Transactions in Block
                </button>
             </div>
        </div>
      </motion.div>
    </div>
  );
};

export default BlockDetails;
