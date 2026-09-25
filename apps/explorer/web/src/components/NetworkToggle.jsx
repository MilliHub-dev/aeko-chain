import { getNetworkConfig } from '../utils/networkConfig';

// Production order: mainnet first whenever it is available. Test-only
// networks (testnet/localnet) follow for console, demo and developer flows.
const NETWORK_ORDER = ['mainnet', 'testnet', 'localnet'];

export default function NetworkToggle({ value, onChange }) {
  const options = NETWORK_ORDER.filter((option) => getNetworkConfig(option).available);

  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-1">
      {options.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-aeko-accent text-black'
                : 'text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {getNetworkConfig(option).label}
          </button>
        );
      })}
    </div>
  );
}
