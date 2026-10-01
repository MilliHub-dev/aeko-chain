// Aeko Scan is the public multi-network presentation boundary.
//
// Production Scan intentionally exposes only Mainnet and Testnet. Devnet remains
// a valid independently deployed chain environment for engineering work, but it
// is not a public Scan target. Localnet exists only as a Vite development
// convenience and is never injected by the production Coolify contract.

const injectedRuntime = globalThis.__AEKO_RUNTIME_CONFIG__ || {};
const devRuntime = globalThis.__AEKO_DEV_RUNTIME_CONFIG__ || {};
const runtime =
  Object.keys(injectedRuntime).length > 0 ? injectedRuntime : devRuntime;

const browserOrigin =
  typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '';
const viteDev = Boolean(import.meta.env?.DEV);

const PUBLIC_NETWORK_ORDER = ['mainnet', 'testnet'];
const NETWORK_ORDER = viteDev
  ? [...PUBLIC_NETWORK_ORDER, 'localnet']
  : PUBLIC_NETWORK_ORDER;

const NETWORK_PRESENTATION = Object.freeze({
  mainnet: Object.freeze({
    name: 'Mainnet',
    badge: 'Mainnet',
    stateLabel: 'Production network',
    explorerSummary: 'Browse confirmed Mainnet blocks, transactions, assets, accounts, and social activity.',
    developerSummary: 'Developer commands on this page target the selected Mainnet deployment.',
    fundingSummary: 'Funding availability follows network policy. Developer airdrop is disabled on Mainnet.',
  }),
  testnet: Object.freeze({
    name: 'Testnet',
    badge: 'Testnet',
    stateLabel: 'Public test network',
    explorerSummary: 'Browse live Testnet blocks, transactions, assets, accounts, and social activity.',
    developerSummary: 'Developer commands on this page target the public Testnet deployment.',
    fundingSummary: 'Test AEKO is available through the funding request below.',
  }),
  localnet: Object.freeze({
    name: 'Local development',
    badge: 'Local',
    stateLabel: 'Local development',
    explorerSummary: 'Browse the locally running AEKO development stack.',
    developerSummary: 'Developer commands on this page target the local development stack.',
    fundingSummary: 'Local funding is for development only.',
  }),
});

function clean(value) {
  return String(value || '').trim();
}

function normalizeNetworkKey(value) {
  const key = clean(value).toLowerCase();
  if (!key) return '';
  if (key === 'mainnet' || key === 'main') return 'mainnet';
  if (key === 'testnet' || key === 'test') return 'testnet';
  if (viteDev && (key === 'localnet' || key === 'local' || key === 'localhost')) {
    return 'localnet';
  }
  return '';
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
  mainnet: validateNetwork(
    'Mainnet',
    normalizeNetwork(runtimeNetworks.mainnet, { funding: true }),
  ),
  testnet: validateNetwork(
    'Testnet',
    normalizeNetwork(runtimeNetworks.testnet, { funding: true }),
  ),
};

if (viteDev) {
  configured.localnet = validateNetwork(
    'Local development',
    normalizeNetwork(runtimeNetworks.localnet, { funding: true }),
  );
}

const requestedActiveNetwork = normalizeNetworkKey(runtime.network);
const activeNetwork =
  requestedActiveNetwork || (viteDev ? 'localnet' : 'testnet');

const useBuiltInLocalFallback =
  viteDev
  && activeNetwork === 'localnet'
  && !configured.localnet?.configured;

if (useBuiltInLocalFallback) {
  configured.localnet = {
    configured: true,
    value: {
      rpcUrl: 'http://127.0.0.1:8899',
      websocketUrl: 'ws://127.0.0.1:8900',
      explorerApiUrl: 'http://127.0.0.1:8088',
      fundingUrl: 'http://127.0.0.1:8088',
    },
  };
}

function explorerUrl() {
  if (!browserOrigin) return '/explorer';
  try {
    return new URL('/explorer', browserOrigin).toString();
  } catch {
    return '/explorer';
  }
}

function networkRecord(network) {
  const state = configured[network] || { configured: false, value: {} };
  const value = state.value;
  const isMainnet = network === 'mainnet';
  const isTestnet = network === 'testnet';
  const fundingUrl = (isTestnet || isMainnet)
    ? value.fundingUrl || value.explorerApiUrl || ''
    : '';

  return {
    key: network,
    label: NETWORK_PRESENTATION[network]?.name || network,
    available: state.configured,
    rpcUrl: value.rpcUrl || '',
    websocketUrl: value.websocketUrl || '',
    explorerUrl: explorerUrl(),
    explorerApiUrl: value.explorerApiUrl || '',
    explorerLabel: 'Open Aeko Scan',
    fundingUrl,
    fundingLabel: (isMainnet || isTestnet)
      ? 'Request AEKO below'
      : 'Development funding only',
    fundingEnabled: Boolean(fundingUrl),
    cliCluster: value.rpcUrl || '',
    isActiveEnvironment: network === activeNetwork,
    isLoopbackFallback: network === 'localnet' && useBuiltInLocalFallback,
  };
}

export const NETWORKS = Object.fromEntries(
  NETWORK_ORDER.map((network) => [network, networkRecord(network)]),
);

export function getNetworkPresentation(network) {
  const key = normalizeNetworkKey(network) || activeNetwork;
  return NETWORK_PRESENTATION[key] || NETWORK_PRESENTATION.testnet;
}

export function getActiveNetwork() {
  return activeNetwork;
}

export function getDefaultExplorerNetwork() {
  if (NETWORKS[activeNetwork]?.available) return activeNetwork;
  return NETWORK_ORDER.find((network) => NETWORKS[network]?.available) || activeNetwork;
}

export function getDefaultNetwork() {
  return getDefaultExplorerNetwork();
}

export function getTestNetwork() {
  if (NETWORKS.testnet?.available) return 'testnet';
  if (viteDev && NETWORKS.localnet?.available) return 'localnet';
  return 'testnet';
}

export function getTestNetworkConfig() {
  return NETWORKS[getTestNetwork()] || networkRecord('testnet');
}

export function isTestSurfaceNetwork(network) {
  const key = normalizeNetworkKey(network) || clean(network).toLowerCase();
  return key === 'testnet' || (viteDev && key === 'localnet');
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

export function isLocalNetworkConfig(config) {
  return viteDev && config?.key === 'localnet';
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
