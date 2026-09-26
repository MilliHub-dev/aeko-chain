import { getNetworkConfig } from '../utils/networkConfig';
import { useNetwork } from './NetworkContext';

const NETWORK_ORDER = ['mainnet', 'testnet', 'devnet', 'localnet'];

export default function NetworkToggle() {
  const { network: value, setNetwork: onChange } = useNetwork();

  const options = NETWORK_ORDER.filter((network) => {
    const config = getNetworkConfig(network);
    return config.available || network !== 'localnet';
  });

  return (
    <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1">
      {options.map((option) => {
        const config = getNetworkConfig(option);
        const active = value === option;
        const disabled = !config.available;
        const label = disabled
          ? `${option[0].toUpperCase() + option.slice(1)} · Not configured`
          : config.label;

        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            title={config.rpcUrl || `${option} endpoints are not configured`}
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
