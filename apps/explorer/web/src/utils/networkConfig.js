// Canonical network endpoints used by the Explorer and developer tools.
// Only the deployed public testnet has built-in defaults. Other networks must
// be configured explicitly instead of being advertised with placeholder URLs.
const TESTNET_DEFAULTS = {
  rpc: 'https://rpc.aeko.online',
  ws: 'wss://ws.aeko.online',
  explorer: 'https://scan.aeko.online',
  explorerApi: 'https://api.aeko.online',
  funding: 'https://fund.aeko.online',
};

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

function isLoopbackEndpoint(value) {
  if (!value) return false;
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

if (hasCompleteLocalOverride && !localOverrideValues.every(isLoopbackEndpoint)) {
  throw new Error(
    'VITE_AEKO_LOCAL_* endpoints are loopback-only. Use the explicit testnet configuration when remote development is intentional.',
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
      funding: '',
    }
  : {
      rpc: import.meta.env.VITE_AEKO_TESTNET_RPC || TESTNET_DEFAULTS.rpc,
      ws: import.meta.env.VITE_AEKO_TESTNET_WS || TESTNET_DEFAULTS.ws,
      explorer: import.meta.env.VITE_AEKO_TESTNET_EXPLORER || TESTNET_DEFAULTS.explorer,
      explorerApi:
        import.meta.env.VITE_AEKO_TESTNET_EXPLORER_API || TESTNET_DEFAULTS.explorerApi,
      funding:
        import.meta.env.VITE_AEKO_TESTNET_FUNDING_URL || TESTNET_DEFAULTS.funding,
    };

const MAINNET_RUNTIME = {
  rpc: import.meta.env.VITE_AEKO_MAINNET_RPC || '',
  ws: import.meta.env.VITE_AEKO_MAINNET_WS || '',
  explorer: import.meta.env.VITE_AEKO_MAINNET_EXPLORER || '',
  explorerApi: import.meta.env.VITE_AEKO_MAINNET_EXPLORER_API || '',
};
const mainnetAvailable = Object.values(MAINNET_RUNTIME).every(Boolean);

export const NETWORKS = {
  mainnet: {
    key: 'mainnet',
    label: mainnetAvailable ? 'Mainnet' : 'Mainnet (not configured)',
    available: mainnetAvailable,
    rpcUrl: MAINNET_RUNTIME.rpc,
    websocketUrl: MAINNET_RUNTIME.ws,
    explorerUrl: MAINNET_RUNTIME.explorer,
    explorerApiUrl: MAINNET_RUNTIME.explorerApi,
    explorerLabel: MAINNET_RUNTIME.explorer ? new URL(MAINNET_RUNTIME.explorer).host : 'Not configured',
    fundingUrl: '',
    fundingLabel: 'No test funding on mainnet',
    fundingEnabled: false,
    cliCluster: MAINNET_RUNTIME.rpc,
  },
  testnet: {
    key: useLocalEndpoints ? 'localnet' : 'testnet',
    label: useLocalEndpoints ? 'Local AEKO Network' : 'Public Testnet',
    available: true,
    rpcUrl: TESTNET_RUNTIME.rpc,
    websocketUrl: TESTNET_RUNTIME.ws,
    explorerUrl: TESTNET_RUNTIME.explorer,
    explorerApiUrl: TESTNET_RUNTIME.explorerApi,
    explorerLabel: new URL(TESTNET_RUNTIME.explorer).host,
    fundingUrl: TESTNET_RUNTIME.funding,
    fundingLabel: useLocalEndpoints
      ? 'Local funding uses requestAirdrop on the local RPC'
      : 'Policy-controlled Testnet Funding Portal',
    fundingEnabled: Boolean(TESTNET_RUNTIME.funding),
    cliCluster: TESTNET_RUNTIME.rpc,
  },
};

export function getNetworkConfig(network) {
  return NETWORKS[network] || NETWORKS.testnet;
}

export function isLocalNetworkConfig(config) {
  return config?.key === 'localnet';
}
