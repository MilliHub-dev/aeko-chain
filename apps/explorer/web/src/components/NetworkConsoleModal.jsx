import NetworkConsoleModalV2 from './NetworkConsoleModalV2';
import { getNetworkConfig } from '../utils/networkConfig';

export default function NetworkConsoleModal(props) {
  const config = getNetworkConfig();

  return (
    <NetworkConsoleModalV2
      {...props}
      websocketUrl={props.websocketUrl || config.websocketUrl}
    />
  );
}
