import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Wallet, ChevronDown, Info, ExternalLink, ShieldCheck, Clock, Zap } from 'lucide-react';

const NetworkSelector = ({ label, selected, onSelect, options }) => (
  <div className="flex-1">
    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">{label}</label>
    <div className="relative group">
      <button className="w-full bg-[#1a1b23] border border-white/10 rounded-xl p-4 flex items-center justify-between hover:border-aeko-accent/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${selected.color} flex items-center justify-center`}>
            {selected.icon}
          </div>
          <span className="font-bold">{selected.name}</span>
        </div>
        <ChevronDown size={16} className="text-gray-400" />
      </button>
      {/* Dropdown would go here in a real app */}
    </div>
  </div>
);

const TokenInput = ({ amount, setAmount, token, balance }) => (
  <div className="bg-[#1a1b23] border border-white/10 rounded-xl p-4 mb-4">
    <div className="flex justify-between mb-2">
      <input
        type="text"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
        className="bg-transparent text-3xl font-bold focus:outline-none w-2/3 placeholder-gray-600"
      />
      <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded-full border border-white/10">
        <div className="w-5 h-5 rounded-full bg-aeko-accent" />
        <span className="font-bold">{token}</span>
        <ChevronDown size={14} className="text-gray-400" />
      </div>
    </div>
    <div className="flex justify-between text-sm text-gray-400">
      <span>≈ ${(parseFloat(amount || 0) * 1.5).toFixed(2)} USD</span>
      <div className="flex gap-2">
        <span>Balance: {balance}</span>
        <button 
          onClick={() => setAmount(balance)}
          className="text-aeko-accent hover:text-white transition-colors uppercase text-xs font-bold"
        >
          Max
        </button>
      </div>
    </div>
  </div>
);

export default function Bridge() {
  const [amount, setAmount] = useState('');
  const [isSwapped, setIsSwapped] = useState(false);
  
  const networks = {
    ethereum: { name: 'Ethereum', color: 'bg-blue-600', icon: 'E' },
    aeko: { name: 'AEKO Chain', color: 'bg-aeko-accent text-black', icon: 'A' },
    solana: { name: 'Solana', color: 'bg-purple-600', icon: 'S' },
  };

  const [fromNetwork, setFromNetwork] = useState(networks.ethereum);
  const [toNetwork, setToNetwork] = useState(networks.aeko);

  const handleSwap = () => {
    setIsSwapped(!isSwapped);
    setFromNetwork(toNetwork);
    setToNetwork(fromNetwork);
  };

  return (
    <div className="pt-24 pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold mb-4"
          >
            AEKO <span className="text-gradient">Bridge</span>
          </motion.h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Securely transfer assets between Ethereum, Solana, and AEKO Chain with low latency and minimal fees.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 max-w-6xl mx-auto">
          
          {/* Bridge Interface */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <div className="bg-[#0f0f16] border border-white/10 rounded-3xl p-6 md:p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-32 bg-aeko-accent/5 blur-[80px] rounded-full pointer-events-none" />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <ArrowLeftRight className="text-aeko-accent" size={20} />
                    Transfer Assets
                  </h2>
                  <div className="flex gap-2">
                    <button className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                      <Clock size={20} />
                    </button>
                    <button className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                      <Info size={20} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center mb-8">
                  <NetworkSelector 
                    label="From" 
                    selected={fromNetwork} 
                    onSelect={setFromNetwork} 
                    options={networks}
                  />
                  <button 
                    onClick={handleSwap}
                    className="mt-6 p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 hover:rotate-180 transition-all duration-300"
                  >
                    <ArrowLeftRight size={20} />
                  </button>
                  <NetworkSelector 
                    label="To" 
                    selected={toNetwork} 
                    onSelect={setToNetwork} 
                    options={networks}
                  />
                </div>

                <TokenInput 
                  amount={amount} 
                  setAmount={setAmount} 
                  token="ETH" 
                  balance="1.45" 
                />

                <div className="bg-white/5 rounded-xl p-4 mb-8 space-y-3 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Bridge Fee (0.1%)</span>
                    <span className="text-white">0.0012 ETH</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Est. Time</span>
                    <span className="text-green-400 flex items-center gap-1"><Zap size={12} /> ~2 mins</span>
                  </div>
                  <div className="border-t border-white/10 pt-3 flex justify-between font-bold">
                    <span>You Receive</span>
                    <span className="text-xl text-aeko-accent">
                      {amount ? (parseFloat(amount) * 0.999).toFixed(4) : '0.00'} ETH
                    </span>
                  </div>
                </div>

                <button className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 text-lg">
                  <Wallet size={20} />
                  Connect Wallet
                </button>
              </div>
            </div>
          </motion.div>

          {/* Info Sidebar */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <ShieldCheck className="text-aeko-accent" size={20} />
                Security First
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                The AEKO Bridge uses a decentralized set of validators and multi-sig guardians to ensure your assets are always safe during transit.
              </p>
              <a href="#" className="text-aeko-accent text-sm flex items-center gap-1 hover:underline">
                View Audit Report <ExternalLink size={12} />
              </a>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="font-bold mb-4">Supported Routes</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Ethereum ↔ AEKO</span>
                  <span className="text-green-400 bg-green-400/10 px-2 py-1 rounded text-xs">Active</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Solana ↔ AEKO</span>
                  <span className="text-green-400 bg-green-400/10 px-2 py-1 rounded text-xs">Active</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">BSC ↔ AEKO</span>
                  <span className="text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded text-xs">Maintenance</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-aeko-accent/20 to-purple-500/20 border border-white/10 rounded-2xl p-6 text-center">
              <h3 className="font-bold mb-2">Need Help?</h3>
              <p className="text-sm text-gray-400 mb-4">
                Join our Discord for 24/7 support regarding bridge transfers.
              </p>
              <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors">
                Contact Support
              </button>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
