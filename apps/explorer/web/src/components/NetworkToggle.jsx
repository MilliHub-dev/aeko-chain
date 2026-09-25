import { getDeployEnv, getNetworkConfig } from '../utils/networkConfig';
import { useNetwork } from './NetworkContext';

// Global toggle: reads and writes the shared network selection, so one
// switch applies to every page. Production order is mainnet first whenever
// it is available; test-only networks follow for console, demo and
// developer flows.
//
// When mainnet is not configured in a production or testnet deploy, it still
// renders as a disabled "coming soon" entry so the UI shows the normal
// testnet + mainnet switch instead of silently hiding mainnet. Local deploys
// expose only localnet.
const NETWORK_ORDER = ['mainnet', 'testnet', 'localnet'];

export default function NetworkToggle() {
  const { network: value, setNetwork: onChange } = useNetwork();
  const deployEnv = getDeployEnv();
  const showMainnetComingSoon =
    (deployEnv === 'production' || deployEnv === 'testnet')
    && !getNetworkConfig('mainnet').available;
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
      {showMainnetComingSoon ? (
        <span
          aria-disabled="true"
          title="Mainnet is coming soon"
          className="cursor-not-allowed rounded-full px-4 py-2 text-sm font-medium text-gray-600"
        >
          Mainnet · Coming soon
        </span>
      ) : null}
    </div>
  );
}
