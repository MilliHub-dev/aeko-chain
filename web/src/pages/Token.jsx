import { motion } from 'framer-motion';
import { Coins, PieChart, TrendingUp, Lock, Zap, Gavel, Users, Shield, ArrowRight } from 'lucide-react';

const TokenMetric = ({ label, value, subtext, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors"
  >
    <h3 className="text-gray-400 text-sm font-medium mb-2">{label}</h3>
    <p className="text-3xl font-bold text-white mb-1">{value}</p>
    {subtext && <p className="text-aeko-accent text-sm">{subtext}</p>}
  </motion.div>
);

const DistributionItem = ({ label, percentage, color, description }) => (
  <div className="mb-6 last:mb-0">
    <div className="flex justify-between items-end mb-2">
      <div>
        <h4 className="font-bold text-white">{label}</h4>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <span className="text-xl font-bold font-mono">{percentage}%</span>
    </div>
    <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${percentage}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
        className={`h-full ${color}`}
      />
    </div>
  </div>
);

const UtilityCard = ({ icon: Icon, title, description }) => (
  <div className="bg-[#0f0f16] border border-white/10 rounded-xl p-6 hover:border-aeko-accent/50 transition-colors group">
    <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center mb-4 group-hover:bg-aeko-accent/10 transition-colors">
      <Icon className="text-aeko-accent" size={24} />
    </div>
    <h3 className="text-xl font-bold mb-2">{title}</h3>
    <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
  </div>
);

export default function Token() {
  return (
    <div className="pt-24 pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Hero Section */}
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-aeko-accent/10 text-aeko-accent border border-aeko-accent/20 text-sm font-medium mb-6"
          >
            <Coins size={14} />
            <span>Ticker: AEKO</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold mb-6"
          >
            Powering the <span className="text-gradient">SocialFi Economy</span>
          </motion.h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            The native utility token of the AEKO Chain. Designed for high-velocity micro-transactions, governance, and identity verification.
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          <TokenMetric label="Total Supply" value="1,000,000,000" subtext="Fixed Cap" delay={0.1} />
          <TokenMetric label="Initial Circulating" value="150,000,000" subtext="15% of Total" delay={0.2} />
          <TokenMetric label="Staking APY" value="8% - 12%" subtext="Dynamic Rate" delay={0.3} />
          <TokenMetric label="Deflation Rate" value="~1.5%" subtext="Annual Burn" delay={0.4} />
        </div>

        {/* Token Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-24 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
              <PieChart className="text-aeko-accent" />
              Token Allocation
            </h2>
            <p className="text-gray-400 mb-8 text-lg">
              A fair launch distribution model focused on long-term ecosystem sustainability and community ownership.
            </p>
            <div className="space-y-2">
              <DistributionItem 
                label="Community Ecosystem" 
                percentage={40} 
                color="bg-green-500" 
                description="Mining rewards, creator grants, and liquidity incentives."
              />
              <DistributionItem 
                label="Early Contributors" 
                percentage={20} 
                color="bg-blue-500" 
                description="Seed investors and strategic partners (2-year vesting)."
              />
              <DistributionItem 
                label="Team & Advisors" 
                percentage={15} 
                color="bg-purple-500" 
                description="Core development team (4-year vesting)."
              />
              <DistributionItem 
                label="Treasury Reserve" 
                percentage={15} 
                color="bg-yellow-500" 
                description="Future fundraising and protocol safety module."
              />
              <DistributionItem 
                label="Public Sale / Airdrop" 
                percentage={10} 
                color="bg-orange-500" 
                description="Initial distribution to the community."
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-white/5 border border-white/10 rounded-3xl p-8 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-32 bg-aeko-accent/10 blur-[100px] rounded-full pointer-events-none" />
            <h3 className="text-xl font-bold mb-6">Vesting Schedule</h3>
            <div className="space-y-8 relative pl-8 border-l border-white/10">
              <div className="relative">
                <div className="absolute -left-[37px] top-1 w-4 h-4 rounded-full bg-aeko-accent border-4 border-[#0a0a0f]" />
                <h4 className="text-white font-bold">TGE (Token Generation Event)</h4>
                <p className="text-sm text-gray-400 mt-1">10% Airdrop + 5% Liquidity unlocked immediately.</p>
              </div>
              <div className="relative">
                <div className="absolute -left-[37px] top-1 w-4 h-4 rounded-full bg-gray-600 border-4 border-[#0a0a0f]" />
                <h4 className="text-white font-bold">Year 1</h4>
                <p className="text-sm text-gray-400 mt-1">Cliff ends for Investors. Linear vesting begins.</p>
              </div>
              <div className="relative">
                <div className="absolute -left-[37px] top-1 w-4 h-4 rounded-full bg-gray-600 border-4 border-[#0a0a0f]" />
                <h4 className="text-white font-bold">Year 2</h4>
                <p className="text-sm text-gray-400 mt-1">Team cliff ends. Ecosystem rewards halving.</p>
              </div>
              <div className="relative">
                <div className="absolute -left-[37px] top-1 w-4 h-4 rounded-full bg-gray-600 border-4 border-[#0a0a0f]" />
                <h4 className="text-white font-bold">Year 4</h4>
                <p className="text-sm text-gray-400 mt-1">Full team and investor tokens fully vested.</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Token Utility */}
        <div className="mb-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Token Utility</h2>
            <p className="text-gray-400">More than just a currency—AEKO is the backbone of the network.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <UtilityCard 
              icon={Zap}
              title="Network Fees"
              description="Pay for transactions and smart contract execution. A portion is burned, making AEKO deflationary."
            />
            <UtilityCard 
              icon={Gavel}
              title="Governance"
              description="Vote on protocol upgrades and treasury allocation via the Token House."
            />
            <UtilityCard 
              icon={Lock}
              title="Staking Security"
              description="Delegate to validators to secure the network and earn staking rewards (PoS)."
            />
            <UtilityCard 
              icon={Shield}
              title="Identity & Clearance"
              description="Pay for Gatekeeper verification and clearance level upgrades (L0 -> L5)."
            />
          </div>
        </div>

        {/* Technical Standards Section (Preserved/Minimally Adapted) */}
        <div className="border-t border-white/10 pt-20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Token Standards</h2>
              <p className="text-gray-400">Built for developers, compatible with SPL.</p>
            </div>
            <button className="flex items-center gap-2 text-aeko-accent hover:text-white transition-colors font-medium">
              Read Developer Docs <ArrowRight size={16} />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-[#0f0f16] p-8 rounded-2xl border border-white/10">
              <h3 className="text-xl font-bold mb-4 text-white">AEKO-20 (Fungible)</h3>
              <p className="text-gray-400 mb-6 text-sm">
                Enhanced SPL standard with native hooks for Identity Verification and Transfer Taxes.
              </p>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> Clearance Level Gating</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> Native Soulbound Support</li>
              </ul>
            </div>
            <div className="bg-[#0f0f16] p-8 rounded-2xl border border-white/10">
              <h3 className="text-xl font-bold mb-4 text-white">AEKO-721 (NFT)</h3>
              <p className="text-gray-400 mb-6 text-sm">
                Optimized for high-volume SocialFi assets using State Compression (Merkle Trees).
              </p>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> 1M Mints for ~$100</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> Social Graph Metadata</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
