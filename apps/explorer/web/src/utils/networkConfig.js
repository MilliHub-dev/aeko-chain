// Canonical public AEKO testnet endpoints. Production builds use these unless
// an explicit complete local endpoint set is supplied (for example CI dogfood).
const TESTNET_DEFAULTS = {
  rpc: 'https://rpc.aeko.online',
  ws: 'wss://ws.aeko.online',
  explorer: 'https://scan.aeko.online',
  explorerApi: 'https://api.aeko.online',
};

// Local development is intentionally isolated from the public testnet. A
// developer must explicitly opt in before a dev build is allowed to use remote
// testnet endpoints; otherwise localhost always talks to the localhost chain.
const LOCAL_DEFAULTS = {
  rpc: 'http://127.0.0.1:8899',
  ws: 'ws://127.0.0.1:8900',
  explorer: 'http://127.0.0.1:4000',
  explorerApi: 'http://127.0.0.1:8088',
};

const LOCAL_OVERRIDE = {
  rpc: import.meta.env.VITE_AEKO_LOCAL_RPC || '',
  ws: import.meta.env.VITE_AEKO_LOCAL_WS || '',
  explorerApi: import.meta.env.VITE_AEKO_LOCAL_EXPLORER_API || '',
};
const localOverrideValues = Object.values(LOCAL_OVERRIDE);
const hasAnyLocalOverride = localOverrideValues.some(Boolean);
const hasCompleteLocalOverride = localOverrideValues.every(Boolean);

if (hasAnyLocalOverride && !hasCompleteLocalOverride) {
  throw new Error(
    'AEKO local endpoint overrides are atomic: set VITE_AEKO_LOCAL_RPC, VITE_AEKO_LOCAL_WS, and VITE_AEKO_LOCAL_EXPLORER_API together.',
  );
}

const forceIsolatedDev =
  import.meta.env.DEV && import.meta.env.VITE_AEKO_ALLOW_REMOTE_IN_DEV !== 'true';
const useLocalEndpoints = hasCompleteLocalOverride || forceIsolatedDev;

const TESTNET_RUNTIME = useLocalEndpoints
  ? {
      rpc: LOCAL_OVERRIDE.rpc || LOCAL_DEFAULTS.rpc,
      ws: LOCAL_OVERRIDE.ws || LOCAL_DEFAULTS.ws,
      explorer: LOCAL_DEFAULTS.explorer,
      explorerApi: LOCAL_OVERRIDE.explorerApi || LOCAL_DEFAULTS.explorerApi,
    }
  : {
      rpc: import.meta.env.VITE_AEKO_TESTNET_RPC || TESTNET_DEFAULTS.rpc,
      ws: import.meta.env.VITE_AEKO_TESTNET_WS || TESTNET_DEFAULTS.ws,
      explorer: import.meta.env.VITE_AEKO_TESTNET_EXPLORER || TESTNET_DEFAULTS.explorer,
      explorerApi:
        import.meta.env.VITE_AEKO_TESTNET_EXPLORER_API || TESTNET_DEFAULTS.explorerApi,
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
    key: useLocalEndpoints ? 'localnet' : 'testnet',
    label: useLocalEndpoints ? 'Local AEKO Network' : 'Testnet',
    rpcUrl: TESTNET_RUNTIME.rpc,
    websocketUrl: TESTNET_RUNTIME.ws,
    explorerUrl: TESTNET_RUNTIME.explorer,
    explorerApiUrl: TESTNET_RUNTIME.explorerApi,
    explorerLabel: new URL(TESTNET_RUNTIME.explorer).host,
    // The faucet is a TCP-only service; users airdrop through requestAirdrop
    // on the selected RPC. There is intentionally no implicit remote fallback.
    faucetUrl: import.meta.env.VITE_AEKO_TESTNET_FAUCET_URL || '',
    faucetLabel: 'Airdrop via requestAirdrop on the selected RPC',
    faucetEnabled: false,
    cliCluster: TESTNET_RUNTIME.rpc,
  },
};

export function getNetworkConfig(network) {
  return NETWORKS[network] || NETWORKS.testnet;
}

export function isLocalNetworkConfig(config) {
  return config?.key === 'localnet';
}
