const IS_BROWSER = typeof window !== 'undefined';
const HOSTNAME = IS_BROWSER ? window.location.hostname : 'localhost';
const PROTOCOL = IS_BROWSER ? window.location.protocol : 'http:';
const WS_PROTOCOL = PROTOCOL === 'https:' ? 'wss:' : 'ws:';

export const NETWORKS = {
  mainnet: {
    key: 'mainnet',
    label: 'Mainnet Beta',
    rpcUrl: import.meta.env.VITE_AEKO_MAINNET_RPC || 'https://api.mainnet.aeko.chain',
    websocketUrl: import.meta.env.VITE_AEKO_MAINNET_WS || 'wss://api.mainnet.aeko.chain',
    explorerUrl: import.meta.env.VITE_AEKO_MAINNET_EXPLORER || 'https://explorer.aeko.chain',
    explorerApiUrl: import.meta.env.VITE_AEKO_MAINNET_EXPLORER_API || '',
    explorerLabel: 'explorer.aeko.chain',
    faucetUrl: import.meta.env.VITE_AEKO_MAINNET_FAUCET_URL || '',
    faucetLabel: 'No public faucet on mainnet',
    faucetEnabled: false,
    cliCluster: 'mainnet',
  },
  testnet: {
    key: 'testnet',
    label: 'Testnet',
    rpcUrl: import.meta.env.VITE_AEKO_TESTNET_RPC || `${PROTOCOL}//${HOSTNAME}:8899`,
    websocketUrl: import.meta.env.VITE_AEKO_TESTNET_WS || `${WS_PROTOCOL}//${HOSTNAME}:8900`,
    explorerUrl: import.meta.env.VITE_AEKO_TESTNET_EXPLORER || `${PROTOCOL}//${HOSTNAME}:3000`,
    explorerApiUrl: import.meta.env.VITE_AEKO_TESTNET_EXPLORER_API || '/api',
    explorerLabel: `${HOSTNAME}:3000`,
    faucetUrl: import.meta.env.VITE_AEKO_TESTNET_FAUCET_URL || `${PROTOCOL}//${HOSTNAME}:9900`,
    faucetLabel: import.meta.env.VITE_AEKO_TESTNET_FAUCET_URL || `${PROTOCOL}//${HOSTNAME}:9900`,
    faucetEnabled: true,
    cliCluster: `${PROTOCOL}//${HOSTNAME}:8899`,
  },
};

export function getNetworkConfig(network) {
  return NETWORKS[network] || NETWORKS.testnet;
}
