import { getNetworkConfig } from '../utils/networkConfig';
import { useNetwork } from './NetworkContext';

const PUBLIC_NETWORK_ORDER = ['mainnet', 'testnet'];

export default function NetworkToggle() {
  const { network: value, setNetwork: onChange } = useNetwork();
  const activeConfig = getNetworkConfig(value);
  const internalEnvironment = !PUBLIC_NETWORK_ORDER.includes(value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1">
        {PUBLIC_NETWORK_ORDER.map((option) => {
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
      {internalEnvironment ? (
        <span
          className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-100"
          title={activeConfig.rpcUrl}
        >
          {activeConfig.label}
        </span>
      ) : null}
    </div>
  );
}
