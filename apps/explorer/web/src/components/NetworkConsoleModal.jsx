import NetworkConsoleModalV2 from './NetworkConsoleModalV2';
import {
  getNetworkConfig,
  getTestNetworkConfig,
  isTestSurfaceNetwork,
} from '../utils/networkConfig';

// Test Console follows the selected non-mainnet deployment. Devnet and
// Localnet remain valid operator/developer environments even though the public
// Scan selector exposes only Mainnet and Testnet.
export default function NetworkConsoleModal(props) {
  const requested = String(props.network || '').toLowerCase();
  const requestedConfig = getNetworkConfig(requested);
  const config =
    requestedConfig.available && isTestSurfaceNetwork(requestedConfig.key)
      ? requestedConfig
      : getTestNetworkConfig();

  return (
    <NetworkConsoleModalV2
      {...props}
      network={config.key}
      websocketUrl={props.websocketUrl || config.websocketUrl}
    />
  );
}
