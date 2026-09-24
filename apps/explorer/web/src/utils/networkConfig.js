// Explorer endpoint ownership is intentionally simple:
// - deployed/preview containers inject AEKO_* values into window.__AEKO_RUNTIME_CONFIG__
// - local Vite development may override only the loopback RPC/WS/API trio
// No remote VITE_AEKO_TESTNET_*, VITE_AEKO_MAINNET_* or VITE_AEKO_DEMO_*
// mirrors are supported. That keeps one deployment source of truth.

const runtime = globalThis.__AEKO_RUNTIME_CONFIG__ || {};
const vite = /** @type {Record<string, string | boolean | undefined>} */ (import.meta.env || {});

export const getRuntimeConfigValue = (key) => String(runtime[key] || '').trim();
const viteValue = (key) => String(vite[key] || '').trim();

const browserOrigin =
  typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '';

const LOCAL_DEFAULTS = {
  rpc: 'http://127.0.0.1:8899',
  ws: 'ws://127.0.0.1:8900',
  explorer: 'http://127.0.0.1:4000',
  explorerApi: 'http://127.0.0.1:8088',
};

const LOCAL_OVERRIDE = {
  rpc: viteValue('VITE_AEKO_LOCAL_RPC'),
  ws: viteValue('VITE_AEKO_LOCAL_WS'),
  explorerApi: viteValue('VITE_AEKO_LOCAL_EXPLORER_API'),
};
const localOverrideValues = Object.values(LOCAL_OVERRIDE);
const hasAnyLocalOverride = localOverrideValues.some(Boolean);
const hasCompleteLocalOverride = localOverrideValues.every(Boolean);

if (hasAnyLocalOverride && !hasCompleteLocalOverride) {
  throw new Error(
    'AEKO local endpoint overrides are atomic: set local RPC, WebSocket, and Explorer API together.',
  );
}

function isLoopbackEndpoint(value) {
  if (!value) return false;
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

if (hasCompleteLocalOverride && !localOverrideValues.every(isLoopbackEndpoint)) {
  throw new Error('AEKO local endpoint overrides must be loopback endpoints.');
}

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

const useLocalEndpoints =
  hasCompleteLocalOverride || (Boolean(vite.DEV) && !hasPublicRuntime);

const TESTNET_RUNTIME = useLocalEndpoints
  ? {
      rpc: LOCAL_OVERRIDE.rpc || LOCAL_DEFAULTS.rpc,
      ws: LOCAL_OVERRIDE.ws || LOCAL_DEFAULTS.ws,
      explorer: LOCAL_DEFAULTS.explorer,
      explorerApi: LOCAL_OVERRIDE.explorerApi || LOCAL_DEFAULTS.explorerApi,
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
