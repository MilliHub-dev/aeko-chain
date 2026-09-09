import NetworkConsoleModalV2 from './NetworkConsoleModalV2';
import { getNetworkConfig } from '../utils/networkConfig';

export default function NetworkConsoleModal(props) {
  const networkKey = String(props.network || '').toLowerCase().startsWith('mainnet')
    ? 'mainnet'
    : 'testnet';
  const config = getNetworkConfig(networkKey);
  const localWs =
    networkKey === 'testnet' && import.meta.env.VITE_AEKO_LOCAL_WS
      ? import.meta.env.VITE_AEKO_LOCAL_WS
      : '';

  return (
    <NetworkConsoleModalV2
      {...props}
      websocketUrl={props.websocketUrl || localWs || config.websocketUrl}
    />
  );
}
