import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Clock, FileText, Activity, Server, Copy, ExternalLink } from 'lucide-react';

const TransactionDetails = () => {
  const { hash } = useParams();

  // Mock Data - In a real app, fetch this based on the hash
  const txData = {
    hash: hash || '0x7f...3a21',
    status: 'Success',
    block: 14205891,
    timestamp: '2025-05-15 14:30:22 UTC',
    from: '0x1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p',
    to: '0x4d5e6f7g8h9i0j1k2l3m4n5o6p1a2b3c',
    value: '150.00 AEKO',
    fee: '0.00042 AEKO',
    gasUsed: '21,000',
    gasLimit: '1,000,000',
    nonce: 42,
    type: 'Transfer'
  };

  return (
    <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <Link to="/explorer" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Explorer
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/10 bg-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <FileText className="h-6 w-6 text-aeko-accent" />
              Transaction Details
            </h1>
            <div className="flex items-center gap-2 mt-2 text-gray-400 font-mono text-sm break-all">
              {txData.hash}
              <button className="hover:text-white transition-colors">
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-green-500/10 text-green-400 px-4 py-2 rounded-lg border border-green-500/20">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Success</span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Main Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 text-gray-400">
                  <Server className="h-5 w-5" />
                  <span>Block Height</span>
                </div>
                <Link to={`/explorer/block/${txData.block}`} className="text-aeko-accent hover:underline font-mono">
                  #{txData.block}
                </Link>
              </div>
              
              <div className="flex items-start justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 text-gray-400">
                  <Clock className="h-5 w-5" />
                  <span>Timestamp</span>
                </div>
                <span className="text-white">{txData.timestamp}</span>
              </div>

              <div className="flex items-start justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 text-gray-400">
                  <Activity className="h-5 w-5" />
                  <span>Transaction Type</span>
                </div>
                <span className="text-white bg-white/10 px-2 py-1 rounded text-sm">{txData.type}</span>
              </div>
            </div>

            <div className="space-y-4">
               <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                <div className="flex justify-between items-center">
                   <span className="text-gray-400">From</span>
                   <Link to="#" className="text-aeko-accent hover:underline font-mono text-sm truncate max-w-[200px]">{txData.from}</Link>
                </div>
                <div className="flex justify-center text-gray-500">
                   ↓
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-gray-400">To</span>
                   <Link to="#" className="text-aeko-accent hover:underline font-mono text-sm truncate max-w-[200px]">{txData.to}</Link>
                </div>
               </div>

               <div className="flex items-start justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3 text-gray-400">
                  <span>Value</span>
                </div>
                <span className="text-white font-bold">{txData.value}</span>
              </div>
            </div>
          </div>

          {/* Details Table */}
          <div className="mt-8">
             <h3 className="text-lg font-bold mb-4 text-white">More Details</h3>
             <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                 <tbody className="divide-y divide-white/5">
                   <tr className="hover:bg-white/5 transition-colors">
                     <td className="py-3 px-4 text-gray-400 w-1/4">Transaction Fee</td>
                     <td className="py-3 px-4 text-white font-mono">{txData.fee}</td>
                   </tr>
                   <tr className="hover:bg-white/5 transition-colors">
                     <td className="py-3 px-4 text-gray-400">Gas Used</td>
                     <td className="py-3 px-4 text-white font-mono">{txData.gasUsed} / {txData.gasLimit}</td>
                   </tr>
                   <tr className="hover:bg-white/5 transition-colors">
                     <td className="py-3 px-4 text-gray-400">Nonce</td>
                     <td className="py-3 px-4 text-white font-mono">{txData.nonce}</td>
                   </tr>
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default TransactionDetails;
