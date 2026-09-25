// Browser-visible network configuration contains only endpoints the browser
// genuinely owns: JSON-RPC, WebSocket, the public Funding Gateway, and the
// same-origin Explorer read proxy. Explorer backend upstream origins remain
// server/container configuration and are never injected into the browser.
//
// Network policy (single source of truth for apps/explorer/web). There are
// exactly three networks — localnet, testnet, mainnet. Testnet is always
// called just "testnet".
// - Deploy env `local` exposes ONLY localnet (loopback validator).
// - Deploy env `testnet` exposes ONLY testnet (configured endpoints; the Vite
//   dev proxy falls back to loopback when nothing is configured).
// - Deploy env `production` exposes testnet + mainnet.
// Explicit env values always override hardcoded loopback defaults.
// - `testnet` is the test server. It is pinned for test-only surfaces:
//   Test Console / network console, nft-demo (AEKO-721 demo), Social E2E lab,
//   and developer testing/simulation helpers. Use `getTestNetwork()` /
//   `getTestNetworkConfig()` for those so they never silently follow mainnet.
// - `devnet` is accepted as a legacy alias and resolves to localnet when
//   localnet is available, otherwise to testnet. There is no separate devnet
//   deployment.

const injectedRuntime = globalThis.__AEKO_RUNTIME_CONFIG__ || {};
const devRuntime = globalThis.__AEKO_DEV_RUNTIME_CONFIG__ || {};
const runtime =
  Object.keys(injectedRuntime).length > 0 ? injectedRuntime : devRuntime;

const browserOrigin =
  typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '';

function clean(value) {
  return String(value || '').trim();
}

function normalizeDeployEnv(value) {
  const normalized = clean(value).toLowerCase();
  if (['local', 'development', 'dev', 'localhost'].includes(normalized)) return 'local';
  if (normalized === 'testnet') return 'testnet';
  if (['production', 'prod', 'preview', 'staging'].includes(normalized)) return 'production';
  return '';
}

// Deploy environment resolution: explicit runtime env first (injected from
// NODE_ENV/AEKO_ENV by the Vite dev proxy or the production container
// entrypoint), then the Vite build mode as fallback.
const viteDev = Boolean(import.meta.env?.DEV);
export function getDeployEnv() {
  return normalizeDeployEnv(runtime.env) || (viteDev ? 'local' : 'production');
}

const isLocalDeploy = getDeployEnv() === 'local';
const isTestnetDeploy = getDeployEnv() === 'testnet';

// Last-resort loopback defaults. Used only for localnet in a local deploy
// when no AEKO_LOCALNET_* env is set. Explicit env always wins over these.
const LOCALNET_HARDCODED_DEFAULTS = {
  rpcUrl: 'http://127.0.0.1:8899',
  websocketUrl: 'ws://127.0.0.1:8900',
  explorerApiUrl: '/api/explorer/localnet',
  fundingUrl: '',
};

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
      `${name} Explorer configuration is partial. Missing: ${missing.join(', ')}.`,
    );
  }

  return {
    configured: anyConfigured && missing.length === 0,
    value: config,
  };
}

function explorerLabel() {
  if (!browserOrigin) return 'This Explorer';
  try {
    return new URL(browserOrigin).host;
  } catch {
    return 'This Explorer';
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
// Explicit localnet env (AEKO_LOCALNET_* via dev proxy or container runtime).
// When present it overrides the hardcoded loopback below.
const configuredLocalnet = validateNetwork(
  'Localnet',
  normalizeNetwork(runtime.localnet, { funding: true }),
);

// Local deploys expose ONLY localnet: loopback fallback applies when neither
// explicit localnet env nor (unreachable-in-local) remote config exists.
// Testnet deploys expose ONLY testnet. Production deploys expose testnet +
// mainnet; localnet only when explicitly configured — the loopback fallback
// never applies outside local deploys.
const useBuiltInLocalFallback =
  isLocalDeploy && !configuredLocalnet.configured;

const localnetValue = configuredLocalnet.configured
  ? configuredLocalnet.value
  : useBuiltInLocalFallback
    ? LOCALNET_HARDCODED_DEFAULTS
    : configuredLocalnet.value;
const localnetAvailable =
  configuredLocalnet.configured || useBuiltInLocalFallback;
const localnetFromEnv = configuredLocalnet.configured;

const testnet = configuredTestnet.value;
const mainnet = configuredMainnet.value;
const testnetAvailable = !isLocalDeploy && configuredTestnet.configured;
const mainnetAvailable = !isLocalDeploy && !isTestnetDeploy && configuredMainnet.configured;

export const NETWORKS = {
  mainnet: {
    key: 'mainnet',
    label: mainnetAvailable ? 'Mainnet · Live' : 'Mainnet (not configured)',
    available: mainnetAvailable,
    rpcUrl: mainnet.rpcUrl,
    websocketUrl: mainnet.websocketUrl,
    explorerUrl: browserOrigin,
    explorerApiUrl: mainnet.explorerApiUrl,
    explorerLabel: explorerLabel(),
    fundingUrl: '',
    fundingLabel: 'No test funding on the live network',
    fundingEnabled: false,
    cliCluster: mainnet.rpcUrl,
  },
  testnet: {
    key: 'testnet',
    label: testnetAvailable
      ? 'Testnet · Test'
      : 'Testnet (not configured)',
    available: testnetAvailable,
    rpcUrl: testnet.rpcUrl,
    websocketUrl: testnet.websocketUrl,
    explorerUrl: browserOrigin || 'http://127.0.0.1:4000',
    explorerApiUrl: testnet.explorerApiUrl,
    explorerLabel: explorerLabel(),
    fundingUrl: testnet.fundingUrl || '',
    fundingLabel: 'Managed testnet funding (Operations Web role)',
    fundingEnabled: Boolean(testnet.fundingUrl),
    cliCluster: testnet.rpcUrl,
  },
  localnet: {
    key: 'localnet',
    label: !localnetAvailable
      ? 'Localnet (not configured)'
      : 'Localnet · Local',
    available: localnetAvailable,
    rpcUrl: localnetValue.rpcUrl,
    websocketUrl: localnetValue.websocketUrl,
    explorerUrl: browserOrigin || 'http://127.0.0.1:4000',
    explorerApiUrl: localnetValue.explorerApiUrl,
    explorerLabel: explorerLabel(),
    fundingUrl: localnetValue.fundingUrl || '',
    fundingLabel: localnetAvailable
      ? 'Local funding uses direct airdrops on the local network'
      : 'Localnet is not configured',
    fundingEnabled: Boolean(localnetValue.fundingUrl),
    cliCluster: localnetValue.rpcUrl,
    fromEnv: localnetFromEnv,
    isLoopbackFallback: useBuiltInLocalFallback && !localnetFromEnv,
  },
};

function normalizeNetworkKey(value) {
  const key = clean(value).toLowerCase();
  if (!key) return '';
  if (key === 'mainnet' || key === 'main') return 'mainnet';
  if (key === 'testnet' || key === 'test') return 'testnet';
  if (key === 'localnet' || key === 'local' || key === 'localhost' || key === 'dev') return 'localnet';
  // Legacy alias: there is no separate devnet deployment. Resolve to
  // localnet when available (local dev), otherwise to the shared testnet.
  if (key === 'devnet' || key === 'development') {
    return NETWORKS.localnet.available ? 'localnet' : 'testnet';
  }
  return '';
}

// Deploy default: localnet in local deploys, testnet in testnet deploys,
// mainnet-first in production. This is the default for Explorer/admin-style
// reads and for every generic `getNetworkConfig()` call without an argument.
export function getDefaultExplorerNetwork() {
  if (isLocalDeploy) return 'localnet';
  if (isTestnetDeploy) return 'testnet';
  if (NETWORKS.mainnet.available) return 'mainnet';
  if (NETWORKS.testnet.available) return 'testnet';
  if (NETWORKS.localnet.available) return 'localnet';
  return 'mainnet';
}

export function getDefaultNetwork() {
  return getDefaultExplorerNetwork();
}

// Test-only surfaces (Test Console / network console, nft-demo, Social E2E,
// developer testing/simulation) must stay pinned to the test server and must
// never silently follow mainnet. Localnet is the fallback so local deploys
// exercise the same code paths against loopback (or explicit AEKO_LOCALNET_*
// env, which overrides hardcoded localhost).
export function getTestNetwork() {
  if (NETWORKS.testnet.available) return 'testnet';
  if (NETWORKS.localnet.available) return 'localnet';
  return 'testnet';
}

export function getTestNetworkConfig() {
  return NETWORKS[getTestNetwork()];
}

export function isTestSurfaceNetwork(network) {
  const key = normalizeNetworkKey(network) || clean(network).toLowerCase();
  return key === 'testnet' || key === 'localnet' || key === 'devnet';
}

// Resolve a requested network honoring availability; unknown or unavailable
// values fall back to the deploy default (localnet in local, mainnet-first
// in production).
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
