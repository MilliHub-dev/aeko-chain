import { Activity, Radio, WalletCards, Waypoints } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getNetworkConfig } from '../utils/networkConfig';

function Status({ available, availableLabel = 'Available' }) {
  return (
    <div className={`text-sm font-medium ${available ? 'text-green-300' : 'text-gray-500'}`}>
      {available ? availableLabel : 'Unavailable'}
    </div>
  );
}

export default function NetworkToolsPanel({ network }) {
  const config = getNetworkConfig(network);
  const isTestnet = config.key === 'testnet';

  const cards = [
    {
      label: 'Network access',
      icon: <Waypoints size={14} />,
      content: <Status available={Boolean(config.rpcUrl)} availableLabel="Connected" />,
    },
    {
      label: 'Live updates',
      icon: <Radio size={14} />,
      content: <Status available={Boolean(config.websocketUrl)} />,
    },
    {
      label: 'Aeko Scan',
      icon: <Activity size={14} />,
      content: (
        <Link
          to="/explorer"
          className="text-sm font-medium text-aeko-accent transition-colors hover:text-white"
        >
          Open explorer
        </Link>
      ),
    },
    {
      label: 'Test AEKO',
      icon: <WalletCards size={14} />,
      content: isTestnet
        ? <Status available={config.fundingEnabled} availableLabel="Available below" />
        : <div className="text-sm font-medium text-gray-500">Not available on Mainnet</div>,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, icon, content }) => (
        <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
            {icon}
            {label}
          </div>
          {content}
        </div>
      ))}
    </div>
  );
}
