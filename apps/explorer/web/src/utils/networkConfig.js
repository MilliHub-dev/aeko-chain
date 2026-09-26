// Aeko Scan is the only application that knows about multiple independently
// deployed chain environments. Each backend/Admin/validator deployment owns a
// single AEKO_NETWORK and generic service URLs; Scan receives a normalized
// network map so users can switch which remote chain they are viewing.

const injectedRuntime = globalThis.__AEKO_RUNTIME_CONFIG__ || {};
const devRuntime = globalThis.__AEKO_DEV_RUNTIME_CONFIG__ || {};
const runtime =
  Object.keys(injectedRuntime).length > 0 ? injectedRuntime : devRuntime;

const browserOrigin =
  typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '';

const NETWORK_ORDER = ['mainnet', 'testnet', 'devnet', 'localnet'];

function clean(value) {
  return String(value || '').trim();
}

function normalizeNetworkKey(value) {
  const key = clean(value).toLowerCase();
  if (!key) return '';
  if (key === 'mainnet' || key === 'main') return 'mainnet';
  if (key === 'testnet' || key === 'test') return 'testnet';
  if (key === 'devnet' || key === 'dev' || key === 'development') return 'devnet';
  if (key === 'localnet' || key === 'local' || key === 'localhost') return 'localnet';
  return '';
}

function explorerLabel() {
  if (!browserOrigin) return 'Aeko Scan';
  try {
    return new URL(browserOrigin).host;
  } catch {
    return 'Aeko Scan';
  }
}

function normalizeNetwork(value, { funding = false } = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const normalized = {
    rpcUrl: clean(input.rpcUrl),
    websocketUrl: clean(input.websocketUrl),
    explorerApiUrl: clean(input.explorerApiUrl),
  };
  if (funding) normalized.fundingUrl = clean(input.fundingUrl);
  return normalized;
}

function validateNetwork(name, config) {
  const required = ['rpcUrl', 'websocketUrl', 'explorerApiUrl'];
  const anyConfigured = Object.values(config).some(Boolean);
  const missing = required.filter((key) => !config[key]);

  if (anyConfigured && missing.length > 0) {
    throw new Error(
      `${name} Scan configuration is partial. Missing: ${missing.join(', ')}.`,
    );
  }

  return {
    configured: anyConfigured && missing.length === 0,
    value: config,
  };
}

const runtimeNetworks =
  runtime.networks && typeof runtime.networks === 'object' ? runtime.networks : {};

const configured = {
  mainnet: validateNetwork('Mainnet', normalizeNetwork(runtimeNetworks.mainnet)),
  testnet: validateNetwork(
    'Testnet',
    normalizeNetwork(runtimeNetworks.testnet, { funding: true }),
  ),
  devnet: validateNetwork(
    'Devnet',
    normalizeNetwork(runtimeNetworks.devnet, { funding: true }),
  ),
  localnet: validateNetwork(
    'Localnet',
    normalizeNetwork(runtimeNetworks.localnet, { funding: true }),
  ),
};

const requestedActiveNetwork = normalizeNetworkKey(runtime.network);
const viteDev = Boolean(import.meta.env?.DEV);
const activeNetwork =
  requestedActiveNetwork || (viteDev ? 'localnet' : 'testnet');

const useBuiltInLocalFallback =
  activeNetwork === 'localnet' && !configured.localnet.configured;

if (useBuiltInLocalFallback) {
  configured.localnet = {
    configured: true,
    value: {
      rpcUrl: 'http://127.0.0.1:8899',
      websocketUrl: 'ws://127.0.0.1:8900',
      explorerApiUrl: '/api/explorer/localnet',
      fundingUrl: '',
    },
  };
}

function networkLabel(network, available) {
  if (!available) {
    return `${network[0].toUpperCase() + network.slice(1)} (not configured)`;
  }
  if (network === 'mainnet') return 'Mainnet · Live';
  if (network === 'testnet') return 'Testnet · Test';
  if (network === 'devnet') return 'Devnet · Development';
  return 'Localnet · Local';
}

function networkRecord(network) {
  const state = configured[network];
  const value = state.value;
  const isMainnet = network === 'mainnet';
  return {
    key: network,
    label: networkLabel(network, state.configured),
    available: state.configured,
    rpcUrl: value.rpcUrl,
    websocketUrl: value.websocketUrl,
    explorerUrl: browserOrigin || 'http://127.0.0.1:4000',
    explorerApiUrl: value.explorerApiUrl,
    explorerLabel: explorerLabel(),
    fundingUrl: isMainnet ? '' : value.fundingUrl || '',
    fundingLabel: isMainnet
      ? 'No test funding on mainnet'
      : `${network} funding through the selected Explorer API`,
    fundingEnabled: !isMainnet && Boolean(value.fundingUrl),
    cliCluster: value.rpcUrl,
    isActiveEnvironment: network === activeNetwork,
    isLoopbackFallback: network === 'localnet' && useBuiltInLocalFallback,
  };
}

export const NETWORKS = Object.fromEntries(
  NETWORK_ORDER.map((network) => [network, networkRecord(network)]),
);

export function getActiveNetwork() {
  return activeNetwork;
}

export function getDefaultExplorerNetwork() {
  if (NETWORKS[activeNetwork]?.available) return activeNetwork;
  return NETWORK_ORDER.find((network) => NETWORKS[network].available) || activeNetwork;
}

export function getDefaultNetwork() {
  return getDefaultExplorerNetwork();
}

export function getTestNetwork() {
  if (
    ['testnet', 'devnet', 'localnet'].includes(activeNetwork)
    && NETWORKS[activeNetwork]?.available
  ) {
    return activeNetwork;
  }
  for (const network of ['testnet', 'devnet', 'localnet']) {
    if (NETWORKS[network].available) return network;
  }
  return 'testnet';
}

export function getTestNetworkConfig() {
  return NETWORKS[getTestNetwork()];
}

export function isTestSurfaceNetwork(network) {
  const key = normalizeNetworkKey(network) || clean(network).toLowerCase();
  return key === 'testnet' || key === 'devnet' || key === 'localnet';
}

export function resolveExplorerNetwork(requested) {
  const key = normalizeNetworkKey(requested);
  if (key && NETWORKS[key]?.available) return key;
  return getDefaultExplorerNetwork();
}

export function getNetworkConfig(network) {
  if (network === undefined || network === null || network === '') {
    return NETWORKS[getDefaultExplorerNetwork()];
  }
  const key = normalizeNetworkKey(network);
  if (key && NETWORKS[key]) return NETWORKS[key];
  return NETWORKS[getDefaultExplorerNetwork()];
}

export function getDemoConfig() {
  const demo = runtime.demo && typeof runtime.demo === 'object' ? runtime.demo : {};
  return {
    rpcUrl: clean(demo.rpcUrl),
    collection: clean(demo.collection),
    token: clean(demo.token),
    metadataUri: clean(demo.metadataUri),
  };
}

export function isLocalNetworkConfig(config) {
  return config?.key === 'localnet';
}

export function isMainnetNetwork(network) {
  return normalizeNetworkKey(network) === 'mainnet';
}

export function isMainnetConfig(config) {
  return config?.key === 'mainnet';
}

export function isTestnetConfig(config) {
  return config?.key === 'testnet';
}
