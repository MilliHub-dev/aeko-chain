import { motion } from 'framer-motion';
import { Coins, Image, Users, BarChart } from 'lucide-react';

const TokenSection = ({ title, description, code, features, reverse }) => (
  <div className={`flex flex-col md:flex-row gap-12 items-center py-16 ${reverse ? 'md:flex-row-reverse' : ''}`}>
    <div className="flex-1">
      <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-aeko-accent/20 flex items-center justify-center text-aeko-accent">
          {title === 'AEKO-20' && <Coins size={20} />}
          {title === 'AEKO-721' && <Image size={20} />}
          {title === 'Creator Coins' && <Users size={20} />}
        </div>
        {title}
      </h3>
      <p className="text-gray-400 mb-6">{description}</p>
      <ul className="space-y-3">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
            <span className="text-aeko-accent mt-1">•</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
    <div className="flex-1 w-full">
      <div className="bg-[#0f0f16] border border-white/10 rounded-xl p-6 overflow-hidden">
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-xs text-gray-500 ml-2">lib.rs</span>
        </div>
        <pre className="font-mono text-sm text-gray-300 overflow-x-auto">
          {code}
        </pre>
      </div>
    </div>
  </div>
);

export default function Token() {
  return (
    <div className="pt-20 pb-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-bold mb-6"
          >
            Next-Gen <span className="text-gradient">Token Standards</span>
          </motion.h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Native support for identity-gated assets, compressed NFTs, and bonding curves.
          </p>
        </div>

        <TokenSection
          title="AEKO-20"
          description="The fungible token standard for the AEKO Chain. Built on SPL with enhanced identity and permission features."
          features={[
            "Identity Hooks: Restrict transfers to specific Clearance Levels (L0-L5).",
            "Native Taxation: Built-in transfer fees for treasuries.",
            "Soulbound Option: Non-transferable tokens for certifications."
          ]}
          code={`pub struct Aeko20Mint {
    pub supply: u64,
    pub decimals: u8,
    // AEKO Extensions
    pub transfer_hook_program_id: Option<Pubkey>,
    pub required_clearance: u8, // Min clearance
}`}
        />

        <TokenSection
          reverse
          title="AEKO-721"
          description="Optimized for high-volume social assets using State Compression (Merkle Trees)."
          features={[
            "Cost Efficiency: Mint 1M NFTs for ~$100.",
            "Off-Chain Storage: Metadata on IPFS/Arweave, only hash on-chain.",
            "Social Context: Native fields for 'Author', 'ReplyTo', 'ThreadId'."
          ]}
          code={`{
  "name": "Aeko Genesis Post",
  "attributes": [
    { "trait_type": "Rarity", "value": "Legendary" },
    { "trait_type": "Clearance", "value": "L3" }
  ],
  "properties": {
    "files": [{ "uri": "ipfs://...", "type": "image/png" }]
  }
}`}
        />

        <TokenSection
          title="Creator Coins"
          description="Personal tokens bonded to a mathematical curve, providing instant liquidity and price discovery."
          features={[
            "Bonding Curve: Price = m * Supply^n",
            "Instant Liquidity: Buy/Sell directly against the protocol.",
            "Access Gating: Hold coin to access private channels."
          ]}
          code={`pub fn buy_creator_coin(ctx: Context, amount: u64) -> Result<()> {
    let curve = &ctx.accounts.curve;
    let price = curve.calculate_price(amount);
    
    // Swap AEKO for Creator Coin
    token::transfer(ctx.accounts.transfer_aeko(), price)?;
    token::mint_to(ctx.accounts.mint_coin(), amount)?;
    Ok(())
}`}
        />

        <div className="mt-20 p-8 rounded-2xl bg-gradient-to-br from-aeko-light to-transparent border border-white/10 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to launch your token?</h2>
          <p className="text-gray-400 mb-8">Use our CLI tools to deploy compliant assets in minutes.</p>
          <div className="inline-flex items-center gap-4 bg-black/30 p-4 rounded-lg font-mono text-sm">
            <span className="text-aeko-accent">$</span>
            <span>aeko-token create-token --clearance 3 --name "WhalePass"</span>
          </div>
        </div>
      </div>
    </div>
  );
}
