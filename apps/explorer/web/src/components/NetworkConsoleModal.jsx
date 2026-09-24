import NetworkConsoleModalV2 from './NetworkConsoleModalV2';
import { getNetworkConfig } from '../utils/networkConfig';

export default function NetworkConsoleModal(props) {
  const networkKey = String(props.network || '').toLowerCase().startsWith('mainnet')
    ? 'mainnet'
    : 'testnet';
  const config = getNetworkConfig(networkKey);

  return (
    <NetworkConsoleModalV2
      {...props}
      websocketUrl={props.websocketUrl || config.websocketUrl}
    />
  );
}
