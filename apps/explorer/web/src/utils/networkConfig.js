// Explorer endpoint ownership has one normalized browser contract:
//
//   { testnet: {...}, mainnet: {...}, demo: {...} }
//
// Production/preview containers inject window.__AEKO_RUNTIME_CONFIG__ at
// startup. Local Vite development receives the same shape from vite.config.js,
// which reads only whitelisted AEKO_TESTNET_*, AEKO_MAINNET_* and AEKO_DEMO_*
// values from .env files. Production builds never bake deployment endpoints.

const injectedRuntime = globalThis.__AEKO_RUNTIME_CONFIG__ || {};
const devRuntime = globalThis.__AEKO_DEV_RUNTIME_CONFIG__ || {};
const runtime =
  Object.keys(injectedRuntime).length > 0 ? injectedRuntime : devRuntime;

const LOCAL_TESTNET_DEFAULTS = {
  rpcUrl: 'http://127.0.0.1:8899',
  websocketUrl: 'ws://127.0.0.1:8900',
  explorerApiUrl: 'http://127.0.0.1:8088',
  explorerUrl: 'http://127.0.0.1:4000',
  fundingUrl: '',
};

const clean = (value) => String(value || '').trim();

function normalizeNetwork(value, { funding = false } = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const normalized = {
    rpcUrl: clean(input.rpcUrl),
    websocketUrl: clean(input.websocketUrl),
    explorerApiUrl: clean(input.explorerApiUrl),
    explorerUrl: clean(input.explorerUrl),
  };
  if (funding) normalized.fundingUrl = clean(input.fundingUrl);
  return normalized;
}

function validateNetwork(name, config) {
  const required = ['rpcUrl', 'websocketUrl', 'explorerApiUrl', 'explorerUrl'];
  const anyConfigured = Object.values(config).some(Boolean);
  const missing = required.filter((key) => !config[key]);

  if (anyConfigured && missing.length > 0) {
    throw new Error(
      `${name} Explorer endpoint configuration is partial. Missing: ${missing.join(', ')}.`,
    );
  }

  return {
    configured: anyConfigured && missing.length === 0,
    value: config,
  };
}

function explorerLabel(url) {
  if (!url) return 'Not configured';
  try {
    return new URL(url).host;
  } catch {
    return 'Invalid URL';
  }
}

const configuredTestnet = validateNetwork(
  'Testnet',
  normalizeNetwork(runtime.testnet, { funding: true }),
);
const configuredMainnet = validateNetwork(
  'Mainnet',
  normalizeNetwork(runtime.mainnet),
);

const useBuiltInLocalTestnet =
  Boolean(import.meta.env.DEV) && !configuredTestnet.configured;

const testnet = useBuiltInLocalTestnet
  ? LOCAL_TESTNET_DEFAULTS
  : configuredTestnet.value;
const mainnet = configuredMainnet.value;

export const NETWORKS = {
  mainnet: {
    key: 'mainnet',
    label: configuredMainnet.configured ? 'Mainnet' : 'Mainnet (not configured)',
    available: configuredMainnet.configured,
    rpcUrl: mainnet.rpcUrl,
    websocketUrl: mainnet.websocketUrl,
    explorerUrl: mainnet.explorerUrl,
    explorerApiUrl: mainnet.explorerApiUrl,
    explorerLabel: explorerLabel(mainnet.explorerUrl),
    fundingUrl: '',
    fundingLabel: 'No test funding on mainnet',
    fundingEnabled: false,
    cliCluster: mainnet.rpcUrl,
  },
  testnet: {
    key: useBuiltInLocalTestnet ? 'localnet' : 'testnet',
    label: useBuiltInLocalTestnet
      ? 'Local AEKO Network'
      : configuredTestnet.configured
        ? 'Public Testnet'
        : 'Public Testnet (not configured)',
    available: useBuiltInLocalTestnet || configuredTestnet.configured,
    rpcUrl: testnet.rpcUrl,
    websocketUrl: testnet.websocketUrl,
    explorerUrl: testnet.explorerUrl,
    explorerApiUrl: testnet.explorerApiUrl,
    explorerLabel: explorerLabel(testnet.explorerUrl),
    fundingUrl: testnet.fundingUrl || '',
    fundingLabel: useBuiltInLocalTestnet
      ? 'Local funding uses requestAirdrop on the local RPC'
      : 'Policy-controlled Testnet Funding Portal',
    fundingEnabled: Boolean(testnet.fundingUrl),
    cliCluster: testnet.rpcUrl,
  },
};

export function getNetworkConfig(network) {
  return NETWORKS[network] || NETWORKS.testnet;
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
