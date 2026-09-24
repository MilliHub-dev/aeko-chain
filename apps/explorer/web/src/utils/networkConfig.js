// Explorer endpoint ownership has one source per runtime:
// - deployed/preview containers inject AEKO_* values into window.__AEKO_RUNTIME_CONFIG__
// - local Vite development uses fixed loopback defaults
//
// Endpoint-specific VITE_AEKO_* variables are intentionally unsupported. Vite
// values are compiled into the bundle and can outlive the environment that
// built the image, which made production deployments fragile and duplicated
// the canonical AEKO_* runtime contract.

const runtime = globalThis.__AEKO_RUNTIME_CONFIG__ || {};

export const getRuntimeConfigValue = (key) => String(runtime[key] || '').trim();

const browserOrigin =
  typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '';

const LOCAL_DEFAULTS = {
  rpc: 'http://127.0.0.1:8899',
  ws: 'ws://127.0.0.1:8900',
  explorer: 'http://127.0.0.1:4000',
  explorerApi: 'http://127.0.0.1:8088',
};

const PUBLIC_TESTNET = {
  rpc: getRuntimeConfigValue('AEKO_PUBLIC_RPC_URL'),
  ws: getRuntimeConfigValue('AEKO_PUBLIC_WS_URL'),
  explorer: getRuntimeConfigValue('AEKO_PUBLIC_EXPLORER_URL') || browserOrigin,
  explorerApi: getRuntimeConfigValue('AEKO_PUBLIC_EXPLORER_API_URL'),
  funding: getRuntimeConfigValue('AEKO_PUBLIC_FUNDING_URL'),
};

const hasPublicRuntime = Boolean(
  PUBLIC_TESTNET.rpc
  && PUBLIC_TESTNET.ws
  && PUBLIC_TESTNET.explorer
  && PUBLIC_TESTNET.explorerApi,
);

// Vite dev is the only implicit local mode. Production/preview builds never
// infer localhost merely because runtime configuration is missing.
const useLocalEndpoints = Boolean(import.meta.env.DEV) && !hasPublicRuntime;

const TESTNET_RUNTIME = useLocalEndpoints
  ? {
      rpc: LOCAL_DEFAULTS.rpc,
      ws: LOCAL_DEFAULTS.ws,
      explorer: LOCAL_DEFAULTS.explorer,
      explorerApi: LOCAL_DEFAULTS.explorerApi,
      funding: '',
    }
  : PUBLIC_TESTNET;

const MAINNET_RUNTIME = {
  rpc: getRuntimeConfigValue('AEKO_MAINNET_RPC_URL'),
  ws: getRuntimeConfigValue('AEKO_MAINNET_WS_URL'),
  explorer: getRuntimeConfigValue('AEKO_MAINNET_EXPLORER_URL'),
  explorerApi: getRuntimeConfigValue('AEKO_MAINNET_EXPLORER_API_URL'),
};

const mainnetAvailable = Object.values(MAINNET_RUNTIME).every(Boolean);
const testnetAvailable = Boolean(
  TESTNET_RUNTIME.rpc
  && TESTNET_RUNTIME.ws
  && TESTNET_RUNTIME.explorer
  && TESTNET_RUNTIME.explorerApi,
);

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
    available: testnetAvailable,
    rpcUrl: TESTNET_RUNTIME.rpc,
    websocketUrl: TESTNET_RUNTIME.ws,
    explorerUrl: TESTNET_RUNTIME.explorer,
    explorerApiUrl: TESTNET_RUNTIME.explorerApi,
    explorerLabel: TESTNET_RUNTIME.explorer ? new URL(TESTNET_RUNTIME.explorer).host : 'Not configured',
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
