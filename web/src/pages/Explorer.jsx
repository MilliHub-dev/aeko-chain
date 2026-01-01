import { motion } from 'framer-motion';
import { Search, Box, Activity, Clock, Shield, Database, ArrowRight, Filter } from 'lucide-react';

const Explorer = () => {
  // Mock Data
  const stats = [
    { label: 'Block Height', value: '14,205,891', icon: Box, change: '+1.2s' },
    { label: 'Transactions', value: '892.5M', icon: Activity, change: '+4.5k/s' },
    { label: 'Active Validators', value: '1,240', icon: Shield, change: '98.9% Uptime' },
    { label: 'Finality Time', value: '400ms', icon: Clock, change: 'Avg' },
  ];

  const recentBlocks = [
    { height: 14205891, proposer: 'Aeko Validator 1', txs: 4520, time: '2s ago' },
    { height: 14205890, proposer: 'SocialFi Node', txs: 3890, time: '2.4s ago' },
    { height: 14205889, proposer: 'Secure Stake', txs: 5102, time: '2.8s ago' },
    { height: 14205888, proposer: 'Aeko Foundation', txs: 4201, time: '3.2s ago' },
    { height: 14205887, proposer: 'Community Node', txs: 3500, time: '3.6s ago' },
  ];

  const recentTxs = [
    { hash: '0x7f...3a21', type: 'Transfer', from: '0x1a...9b2c', to: '0x4d...1e2f', value: '150 AEKO', time: '1s ago' },
    { hash: '0x2b...9c8d', type: 'Contract Call', from: '0x8e...5f6a', to: 'Aeko Swap', value: '0 AEKO', time: '1s ago' },
    { hash: '0x9c...1d4e', type: 'NFT Mint', from: '0x3f...2a1b', to: 'Creator Drop', value: '50 AEKO', time: '2s ago' },
    { hash: '0x5a...8b9c', type: 'Social Post', from: '0x7c...4d3e', to: 'Social Graph', value: '0.01 AEKO', time: '2s ago' },
    { hash: '0x1d...6e7f', type: 'Delegate', from: '0x2b...8a9c', to: 'Validator 1', value: '1000 AEKO', time: '3s ago' },
  ];

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Hero Search Section */}
      <div className="text-center mb-16">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-bold mb-6"
        >
          <span className="text-gradient">Aeko Scan</span> Explorer
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto"
        >
          Explore blocks, transactions, and network statistics on the high-performance AEKO Chain.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="max-w-3xl mx-auto relative"
        >
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by Address, Txn Hash, Block, or Token"
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-aeko-accent/50 focus:border-transparent transition-all shadow-lg shadow-black/20"
          />
          <button className="absolute inset-y-2 right-2 bg-aeko-accent/10 hover:bg-aeko-accent/20 text-aeko-accent px-4 rounded-xl font-medium transition-colors">
            Search
          </button>
        </motion.div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-aeko-accent/10 rounded-xl group-hover:bg-aeko-accent/20 transition-colors">
                <stat.icon className="h-6 w-6 text-aeko-accent" />
              </div>
              <span className="text-xs font-medium text-aeko-accent bg-aeko-accent/5 px-2 py-1 rounded-full border border-aeko-accent/10">
                {stat.change}
              </span>
            </div>
            <h3 className="text-gray-400 text-sm font-medium mb-1">{stat.label}</h3>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Latest Blocks */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Box className="h-5 w-5 text-aeko-accent" />
              Latest Blocks
            </h2>
            <button className="text-sm text-aeko-accent hover:text-white transition-colors flex items-center gap-1">
              View All <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {recentBlocks.map((block) => (
              <div key={block.height} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-gray-800 p-3 rounded-lg text-center min-w-[60px]">
                    <span className="block text-xs text-gray-500">Bk</span>
                    <span className="font-mono text-sm font-bold text-white">{block.height.toString().slice(-4)}</span>
                  </div>
                  <div>
                    <div className="text-aeko-accent font-mono text-sm hover:underline cursor-pointer">#{block.height}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Proposer: <span className="text-white hover:text-aeko-accent cursor-pointer">{block.proposer}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400 mb-1">{block.time}</div>
                  <div className="text-xs font-medium bg-white/10 px-2 py-1 rounded text-gray-300 inline-block">
                    {block.txs} txns
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 text-center border-t border-white/10">
            <button className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors uppercase font-medium tracking-wide">
              View All Blocks
            </button>
          </div>
        </motion.div>

        {/* Latest Transactions */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-aeko-accent" />
              Latest Transactions
            </h2>
            <button className="text-sm text-aeko-accent hover:text-white transition-colors flex items-center gap-1">
              View All <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {recentTxs.map((tx) => (
              <div key={tx.hash} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-gray-800 p-3 rounded-lg flex items-center justify-center min-w-[50px]">
                    <span className="font-bold text-xs text-gray-400">Tx</span>
                  </div>
                  <div>
                    <div className="text-aeko-accent font-mono text-sm hover:underline cursor-pointer">{tx.hash}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      From <span className="text-white hover:text-aeko-accent cursor-pointer">{tx.from}</span>
                      <span className="mx-1">→</span>
                      <span className="text-white hover:text-aeko-accent cursor-pointer">{tx.to}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400 mb-1">{tx.time}</div>
                  <div className="text-xs font-medium bg-white/10 px-2 py-1 rounded text-gray-300 inline-block">
                    {tx.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 text-center border-t border-white/10">
            <button className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors uppercase font-medium tracking-wide">
              View All Transactions
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Explorer;
