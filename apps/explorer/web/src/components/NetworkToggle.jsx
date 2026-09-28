import { getNetworkConfig } from '../utils/networkConfig';
import { useNetwork } from './NetworkContext';

const PUBLIC_NETWORK_ORDER = ['mainnet', 'testnet'];

export default function NetworkToggle() {
  const { network: value, setNetwork: onChange } = useNetwork();

  return (
    <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1">
      {PUBLIC_NETWORK_ORDER.map((option) => {
        const config = getNetworkConfig(option);
        const active = value === option;
        const disabled = !config.available;
        const label = config.label;

        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            title={disabled ? `${label} is not available yet` : `Switch to ${label}`}
            onClick={() => onChange(option)}
            className={`rounded-full px-4 text-nowrap py-2 text-sm font-medium transition-colors ${
              disabled
                ? 'cursor-not-allowed text-gray-600'
                : active
                  ? 'bg-aeko-accent text-black'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
