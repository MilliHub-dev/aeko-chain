import NetworkConsoleModalV2 from './NetworkConsoleModalV2';
import { getNetworkConfig } from '../utils/networkConfig';

// The Test Console is a test-only surface. It is rendered only for test
// networks (testnet/localnet — see NetworkTools `isTestNetwork` gating), so
// this wrapper resolves the caller's network label/key to the matching test
// config. `devnet` is a legacy alias for the test network. Mainnet never
// reaches the console; it falls back to testnet.
export default function NetworkConsoleModal(props) {
  const requested = String(props.network || '').toLowerCase();
  const networkKey = requested.includes('local')
    ? (getNetworkConfig('localnet').available ? 'localnet' : 'testnet')
    : 'testnet';
  const config = getNetworkConfig(networkKey);

  return (
    <NetworkConsoleModalV2
      {...props}
      websocketUrl={props.websocketUrl || config.websocketUrl}
    />
  );
}
