import { motion } from 'framer-motion';
import { Coins, PieChart, TrendingUp, Lock, Zap, Gavel, Shield, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

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

const DistributionItem = ({ label, percentage, amount, color, description }) => (
  <div className="mb-6 last:mb-0">
    <div className="flex justify-between items-end mb-2">
      <div>
        <h4 className="font-bold text-white">{label}</h4>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <div className="text-right">
        <div className="text-xl font-bold font-mono">{percentage}%</div>
        <div className="text-xs text-gray-500">{amount}</div>
      </div>
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

const StatRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-b-0">
    <span className="text-sm text-gray-400">{label}</span>
    <span className="text-sm text-white font-medium text-right">{value}</span>
  </div>
);

export default function Token() {
  const allocations = [
    {
      label: 'Validator Rewards',
      percentage: 30,
      amount: '150B AEKO',
      color: 'bg-lime-500',
      description: 'Epoch emissions for validators and delegators during network bootstrap.',
    },
    {
      label: 'Community & SocialFi Rewards',
      percentage: 25,
      amount: '125B AEKO',
      color: 'bg-emerald-500',
      description: 'Creator incentives, engagement rewards, and community growth programs.',
    },
    {
      label: 'Treasury',
      percentage: 20,
      amount: '100B AEKO',
      color: 'bg-cyan-500',
      description: 'Protocol treasury for grants, operations, subsidies, and governance-directed spending.',
    },
    {
      label: 'Team & Contributors',
      percentage: 12,
      amount: '60B AEKO',
      color: 'bg-amber-500',
      description: '1-year vesting schedule with a 12-month cliff.',
    },
    {
      label: 'Ecosystem / Grants',
      percentage: 8,
      amount: '40B AEKO',
      color: 'bg-fuchsia-500',
      description: 'Developer growth, ecosystem partnerships, and strategic grants.',
    },
    {
      label: 'Public Sale / TGE',
      percentage: 5,
      amount: '25B AEKO',
      color: 'bg-orange-500',
      description: 'Initial market distribution and genesis circulating supply baseline.',
    },
  ];

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
            Transparent <span className="text-gradient">Tokenomics</span> for AEKO
          </motion.h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            AEKO is the native gas, staking, governance, and SocialFi reward token of AEKO Chain. The numbers below reflect the current signed-off Phase 2 tokenomics baseline.
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          <TokenMetric label="Governed Supply Target" value="500B" subtext="Initial supply baseline" delay={0.1} />
          <TokenMetric label="Genesis Circulating" value="25B" subtext="Public sale at launch" delay={0.2} />
          <TokenMetric label="Epoch Duration" value="1 Day" subtext="365 epochs per year" delay={0.3} />
          <TokenMetric label="Base Fee" value="0.00025" subtext="AEKO per transaction" delay={0.4} />
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
              AEKO follows a disclosed allocation model so users, validators, and builders can see exactly how supply is reserved across emissions, community incentives, treasury, and vesting.
            </p>
            <div className="space-y-2">
              {allocations.map((item) => (
                <DistributionItem key={item.label} {...item} />
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-white/5 border border-white/10 rounded-3xl p-8 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-32 bg-aeko-accent/10 blur-[100px] rounded-full pointer-events-none" />
            <h3 className="text-xl font-bold mb-6">Emission and Vesting Transparency</h3>
            <div className="space-y-8 relative pl-8 border-l border-white/10">
              <div className="relative">
                <div className="absolute -left-[37px] top-1 w-4 h-4 rounded-full bg-aeko-accent border-4 border-[#0a0a0f]" />
                <h4 className="text-white font-bold">Genesis</h4>
                <p className="text-sm text-gray-400 mt-1">25B AEKO enters circulation via the public sale baseline.</p>
              </div>
              <div className="relative">
                <div className="absolute -left-[37px] top-1 w-4 h-4 rounded-full bg-gray-600 border-4 border-[#0a0a0f]" />
                <h4 className="text-white font-bold">Year 1</h4>
                <p className="text-sm text-gray-400 mt-1">40B AEKO annual emissions, or 109,589,041 AEKO per epoch. Team allocation remains locked through the 12-month cliff.</p>
              </div>
              <div className="relative">
                <div className="absolute -left-[37px] top-1 w-4 h-4 rounded-full bg-gray-600 border-4 border-[#0a0a0f]" />
                <h4 className="text-white font-bold">Year 2</h4>
                <p className="text-sm text-gray-400 mt-1">30B AEKO annual emissions. Team tokens unlock at cliff under the current signed-off 12-month vesting policy.</p>
              </div>
              <div className="relative">
                <div className="absolute -left-[37px] top-1 w-4 h-4 rounded-full bg-gray-600 border-4 border-[#0a0a0f]" />
                <h4 className="text-white font-bold">Year 5+</h4>
                <p className="text-sm text-gray-400 mt-1">The network enters a perpetual 1% floor inflation regime at 5B AEKO per year, minted fresh after the validator rewards reserve is exhausted.</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-24">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <TrendingUp className="text-aeko-accent" />
              Emissions by Year
            </h3>
            <div className="space-y-3">
              <StatRow label="Year 1" value="40B AEKO / 109,589,041 per epoch" />
              <StatRow label="Year 2" value="30B AEKO / 82,191,780 per epoch" />
              <StatRow label="Year 3" value="20B AEKO / 54,794,520 per epoch" />
              <StatRow label="Year 4" value="10B AEKO / 27,397,260 per epoch" />
              <StatRow label="Year 5+" value="5B AEKO / 13,698,630 per epoch" />
            </div>
            <p className="text-sm text-gray-500 mt-5">
              Year 5+ emissions continue under the managed-cap model and are minted fresh after the validator rewards bucket is depleted.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <Lock className="text-aeko-accent" />
              Fee and Validator Policy
            </h3>
            <div className="space-y-3">
              <StatRow label="Fee Split" value="40% burn / 40% treasury / 20% validator tip" />
              <StatRow label="Priority Fee" value="Optional and user-set" />
              <StatRow label="App Subsidy Cap" value="1,000,000 AEKO per registered app / month" />
              <StatRow label="Commission Range" value="5% to 10%" />
              <StatRow label="Uptime Bonus" value="1.10x at 99%+ uptime" />
              <StatRow label="Low-Uptime Penalty" value="0.80x below 95%, 0 reward below 80%" />
              <StatRow label="Downtime Slash" value="0.5% of validator stake to treasury" />
              <StatRow label="Double-Sign Slash" value="5% of validator stake to treasury" />
            </div>
          </div>
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
              description="Pay for transactions and smart contract execution. Every fee is transparently split between burn, treasury, and validator incentives."
            />
            <UtilityCard 
              icon={Gavel}
              title="Governance"
              description="Vote on protocol upgrades and governable tokenomics fields such as base fee, burn rate, subsidy cap, epoch duration, and floor inflation."
            />
            <UtilityCard 
              icon={Lock}
              title="Staking Security"
              description="Delegate to validators, earn a share of epoch emissions, and participate in the uptime-weighted reward model."
            />
            <UtilityCard 
              icon={Shield}
              title="SocialFi Funding"
              description="Support creator incentives, community rewards, ecosystem grants, and treasury-funded fee subsidies for approved social apps."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-24">
          <div className="bg-[#0f0f16] p-8 rounded-2xl border border-white/10">
            <h3 className="text-xl font-bold mb-4 text-white">Reward Formula</h3>
            <pre className="bg-black/40 p-4 rounded-xl overflow-x-auto text-sm text-gray-300">
{`stake_weight = validator_stake / total_staked_supply
gross_reward = (stake_weight * epoch_emission) * uptime_multiplier
validator_take = gross_reward * commission_rate
delegator_pool = gross_reward * (1 - commission_rate)`}
            </pre>
            <p className="text-sm text-gray-400 mt-4">
              Users can audit validator rewards against stake weight, uptime bands, commission, and slashing behavior.
            </p>
          </div>

          <div className="bg-[#0f0f16] p-8 rounded-2xl border border-white/10">
            <h3 className="text-xl font-bold mb-4 text-white">Governable Fields</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent" /> Base fee</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent" /> Burn rate</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent" /> Treasury rate</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent" /> Social subsidy monthly cap</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent" /> Epoch duration</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent" /> Floor inflation rate</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Token Standards</h2>
              <p className="text-gray-400">Built for developers, documented for users, and aligned to the signed-off tokenomics model.</p>
            </div>
            <Link to="/docs" className="flex items-center gap-2 text-aeko-accent hover:text-white transition-colors font-medium">
              Read Developer Docs <ArrowRight size={16} />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-[#0f0f16] p-8 rounded-2xl border border-white/10">
              <h3 className="text-xl font-bold mb-4 text-white">AEKO-20 (Fungible)</h3>
              <p className="text-gray-400 mb-6 text-sm">
                Canonical fungible token standard for mint, transfer, burn, allowance, and emissions-aware supply controls.
              </p>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> Mint / transfer / burn / allowance</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> Optional identity and transfer hooks</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> Validator emissions integration</li>
              </ul>
            </div>
            <div className="bg-[#0f0f16] p-8 rounded-2xl border border-white/10">
              <h3 className="text-xl font-bold mb-4 text-white">AEKO-721 (NFT)</h3>
              <p className="text-gray-400 mb-6 text-sm">
                Canonical NFT standard for creator assets, collectibles, social objects, metadata validation, and creator royalty storage.
              </p>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> Unique token IDs and metadata URI validation</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> Creator royalties and SocialFi metadata extensions</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-aeko-accent"/> Freeze / thaw controls for moderation-aware NFT flows</li>
              </ul>
              <Link to="/nft-demo" className="inline-flex items-center gap-2 mt-6 text-aeko-accent hover:text-white transition-colors text-sm font-medium">
                Open AEKO-721 Demo <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
