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
    rpcUrl: import.meta.env.VITE_AEKO_TESTNET_RPC || 'https://api.testnet.aeko.chain',
    websocketUrl: import.meta.env.VITE_AEKO_TESTNET_WS || 'wss://api.testnet.aeko.chain',
    explorerUrl:
      import.meta.env.VITE_AEKO_TESTNET_EXPLORER || 'https://testnet.explorer.aeko.chain',
    explorerApiUrl: import.meta.env.VITE_AEKO_TESTNET_EXPLORER_API || '',
    explorerLabel: 'testnet.explorer.aeko.chain',
    faucetUrl: import.meta.env.VITE_AEKO_TESTNET_FAUCET_URL || '',
    faucetLabel: import.meta.env.VITE_AEKO_TESTNET_FAUCET_URL
      ? import.meta.env.VITE_AEKO_TESTNET_FAUCET_URL
      : 'Faucet URL not configured',
    faucetEnabled: Boolean(import.meta.env.VITE_AEKO_TESTNET_FAUCET_URL),
    cliCluster: 'testnet',
  },
};

export function getNetworkConfig(network) {
  return NETWORKS[network] || NETWORKS.testnet;
}
