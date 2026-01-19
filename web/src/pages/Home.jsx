import { motion } from 'framer-motion';
import { Shield, Zap, Users, Code, ArrowRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

const Hero = () => {
  return (
    <div className="relative overflow-hidden pt-20 pb-32">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-aeko-purple/20 rounded-full blur-3xl opacity-50" />
      <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-aeko-accent/10 rounded-full blur-3xl opacity-30" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <span className="inline-block py-1 px-3 rounded-full bg-white/5 border border-white/10 text-aeko-accent text-sm font-medium mb-6">
            🚀 Mainnet Beta is Live
          </span>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8">
            The First <span className="text-gradient">Permissioned Layer-1</span><br />
            for SocialFi
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            AEKO Chain combines the speed of SVM with a native Permission Layer.
            Build compliant, identity-aware applications without sacrificing decentralization.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/docs"
              className="px-8 py-4 rounded-lg bg-white text-black font-bold hover:bg-gray-200 transition-colors flex items-center gap-2"
            >
              Read the Docs <ArrowRight size={20} />
            </Link>
            <Link
              to="/developers"
              className="px-8 py-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-medium"
            >
              Start Building
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const FeatureCard = ({ icon: Icon, title, description, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 0.5 }}
    className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-aeko-accent/50 transition-colors group"
  >
    <div className="w-12 h-12 rounded-lg bg-aeko-light flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
      <Icon className="text-aeko-accent" size={24} />
    </div>
    <h3 className="text-xl font-bold mb-2">{title}</h3>
    <p className="text-gray-400 leading-relaxed">{description}</p>
  </motion.div>
);

export default function Home() {
  const features = [
    {
      icon: Shield,
      title: "Permission Layer",
      description: "Native on-chain ACLs with 6 clearance levels (L0-L5). Gate transactions based on identity verification without centralized middleware."
    },
    {
      icon: Users,
      title: "SocialFi Native",
      description: "Built-in Proof of Engagement (PoE) and Reputation Protocol. Mint millions of Compressed NFTs (cNFTs) for social content at minimal cost."
    },
    {
      icon: Zap,
      title: "SVM Performance",
      description: "Powered by the Sealevel runtime. Parallel transaction processing delivering 100k+ TPS with sub-second finality."
    },
    {
      icon: Lock,
      title: "Content Signatures",
      description: "Immutable content verification. Combat deepfakes and misinformation with cryptographic content signatures at the protocol level."
    },
    {
      icon: Code,
      title: "Developer Friendly",
      description: "Write smart contracts in Rust. Full compatibility with existing SVM tooling while adding powerful identity hooks."
    },
    {
      icon: Users,
      title: "Two-House Governance",
      description: "Balanced governance system. Token House manages economics, while the Citizen House (One Person, One Vote) oversees social integrity."
    }
  ];

  return (
    <div>
      <Hero />
      
      <section className="py-24 bg-aeko-light/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Build on AEKO?</h2>
            <p className="text-gray-400">The infrastructure gap between public chains and private silos is finally closed.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <FeatureCard key={i} {...f} delay={i * 0.1} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              The <span className="text-aeko-purple">Identity-First</span><br />
              Blockchain
            </h2>
            <p className="text-gray-400 mb-6 text-lg">
              Most blockchains are anonymous by default. AEKO is different. 
              We treat Identity as a first-class citizen, enabling compliant DeFi, 
              Sybil-resistant voting, and trusted social networks.
            </p>
            <ul className="space-y-4 mb-8">
              {[
                'Soulbound Tokens (SBTs) for Clearance',
                'Zero-Knowledge Identity Proofs',
                'Regulatory Compliance Hooks'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-aeko-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link to="/token" className="text-aeko-accent font-medium hover:underline">
              Learn about Identity Tokens &rarr;
            </Link>
          </div>
          <div className="flex-1 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-aeko-accent to-aeko-purple blur-3xl opacity-20" />
            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
              <pre className="text-sm text-gray-300 font-mono overflow-x-auto">
{`// AEKO-20 Token with Identity Hook
pub struct RestrictedToken {
    pub mint: Pubkey,
    pub clearance_level: u8, // L3 Required
}

impl TransferHook for RestrictedToken {
    fn check_transfer(ctx: Context) -> Result<()> {
        let sender = ctx.accounts.sender;
        
        // Native Runtime Check
        if sender.clearance < 3 {
            return Err(Error::InsufficientClearance);
        }
        Ok(())
    }
}`}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
