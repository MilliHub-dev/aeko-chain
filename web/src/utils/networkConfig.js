// Default endpoints for the public AEKO testnet. The production build
// overrides these via web/.env.production (VITE_AEKO_TESTNET_*). These
// fallbacks deliberately point at the canonical hostnames — no ports, no
// hostname-derived URLs — so the UI never displays bare IPs or :8899-style
// addresses even when env vars are missing.
const TESTNET_DEFAULTS = {
  rpc: 'https://rpc.aeko.online',
  ws: 'wss://ws.aeko.online',
  explorer: 'https://gossip.aeko.online',
  explorerApi: 'https://api.aeko.online',
};

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
    rpcUrl: import.meta.env.VITE_AEKO_TESTNET_RPC || TESTNET_DEFAULTS.rpc,
    websocketUrl: import.meta.env.VITE_AEKO_TESTNET_WS || TESTNET_DEFAULTS.ws,
    explorerUrl: import.meta.env.VITE_AEKO_TESTNET_EXPLORER || TESTNET_DEFAULTS.explorer,
    explorerApiUrl: import.meta.env.VITE_AEKO_TESTNET_EXPLORER_API || TESTNET_DEFAULTS.explorerApi,
    explorerLabel: new URL(
      import.meta.env.VITE_AEKO_TESTNET_EXPLORER || TESTNET_DEFAULTS.explorer
    ).host,
    // The faucet is a TCP-only service; users airdrop via the RPC's
    // requestAirdrop method, not a separate URL. We surface the RPC here so
    // the CLI snippet stays self-contained.
    faucetUrl: import.meta.env.VITE_AEKO_TESTNET_FAUCET_URL || '',
    faucetLabel: 'Airdrop via requestAirdrop on the RPC',
    faucetEnabled: false,
    cliCluster: import.meta.env.VITE_AEKO_TESTNET_RPC || TESTNET_DEFAULTS.rpc,
  },
};

export function getNetworkConfig(network) {
  return NETWORKS[network] || NETWORKS.testnet;
}
