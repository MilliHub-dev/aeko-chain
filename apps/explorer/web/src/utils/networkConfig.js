// Browser-visible network configuration contains only endpoints the browser
// genuinely owns: JSON-RPC, WebSocket, the public Funding Gateway, and the
// same-origin Explorer read proxy. Explorer backend upstream origins remain
// server/container configuration and are never injected into the browser.
//
// Network policy (single source of truth for apps/explorer/web):
// - `mainnet` is production. Every production surface defaults to mainnet
//   whenever it is configured. `getNetworkConfig()` with no argument and
//   `getDefaultExplorerNetwork()` both resolve mainnet-first.
// - `testnet` is the shared test server. It is pinned for test-only surfaces:
//   Test Console / network console, nft-demo (AEKO-721 demo), Social E2E lab,
//   and developer testing/simulation helpers. Use `getTestNetwork()` /
//   `getTestNetworkConfig()` for those so they never silently follow mainnet.
// - `localnet` means "running locally" (loopback validator). Hardcoded
//   localhost defaults are a last-resort fallback ONLY. Any explicit
//   `AEKO_LOCALNET_*` env value always overrides the hardcoded loopback —
//   env variables are prioritized above hardcoded network config.
// - `devnet` is accepted as a legacy alias and resolves to localnet when
//   localnet is available, otherwise to testnet. There is no separate devnet
//   deployment; the alias exists only to fix the historical devnet/testnet/
//   localnet mix-up.

const injectedRuntime = globalThis.__AEKO_RUNTIME_CONFIG__ || {};
const devRuntime = globalThis.__AEKO_DEV_RUNTIME_CONFIG__ || {};
const runtime =
  Object.keys(injectedRuntime).length > 0 ? injectedRuntime : devRuntime;

const browserOrigin =
  typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '';

// Last-resort loopback defaults. Used only when no AEKO_LOCALNET_* env is
// set. Explicit env always wins over these values.
const LOCALNET_HARDCODED_DEFAULTS = {
  rpcUrl: 'http://127.0.0.1:8899',
  websocketUrl: 'ws://127.0.0.1:8900',
  explorerApiUrl: '/api/explorer/localnet',
  fundingUrl: '',
};

const clean = (value) => String(value || '').trim();

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

const isDev = Boolean(import.meta.env?.DEV);
// Hardcoded loopback applies only as a last resort: local vite dev with
// neither testnet nor mainnet nor explicit localnet env configured.
const useBuiltInLocalFallback =
  isDev &&
  !configuredTestnet.configured &&
  !configuredMainnet.configured &&
  !configuredLocalnet.configured;

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

export const NETWORKS = {
  mainnet: {
    key: 'mainnet',
    label: configuredMainnet.configured ? 'Mainnet' : 'Mainnet (not configured)',
    available: configuredMainnet.configured,
    rpcUrl: mainnet.rpcUrl,
    websocketUrl: mainnet.websocketUrl,
    explorerUrl: browserOrigin,
    explorerApiUrl: mainnet.explorerApiUrl,
    explorerLabel: explorerLabel(),
    fundingUrl: '',
    fundingLabel: 'No test funding on mainnet',
    fundingEnabled: false,
    cliCluster: mainnet.rpcUrl,
  },
  testnet: {
    key: 'testnet',
    label: configuredTestnet.configured
      ? 'Public Testnet'
      : 'Public Testnet (not configured)',
    available: configuredTestnet.configured,
    rpcUrl: testnet.rpcUrl,
    websocketUrl: testnet.websocketUrl,
    explorerUrl: browserOrigin || 'http://127.0.0.1:4000',
    explorerApiUrl: testnet.explorerApiUrl,
    explorerLabel: explorerLabel(),
    fundingUrl: testnet.fundingUrl || '',
    fundingLabel: 'Policy-controlled Testnet Funding Portal',
    fundingEnabled: Boolean(testnet.fundingUrl),
    cliCluster: testnet.rpcUrl,
  },
  localnet: {
    key: 'localnet',
    label: !localnetAvailable
      ? 'Localnet (not configured)'
      : localnetFromEnv
        ? 'Localnet (env)'
        : 'Local AEKO Network',
    available: localnetAvailable,
    rpcUrl: localnetValue.rpcUrl,
    websocketUrl: localnetValue.websocketUrl,
    explorerUrl: browserOrigin || 'http://127.0.0.1:4000',
    explorerApiUrl: localnetValue.explorerApiUrl,
    explorerLabel: explorerLabel(),
    fundingUrl: localnetValue.fundingUrl || '',
    fundingLabel: localnetAvailable
      ? 'Local funding uses requestAirdrop on the local RPC'
      : 'Localnet is not configured',
    fundingEnabled: Boolean(localnetValue.fundingUrl),
    cliCluster: localnetValue.rpcUrl,
    fromEnv: localnetFromEnv,
    isLoopbackFallback: useBuiltInLocalFallback && !localnetFromEnv,
  },
};

// Canonical network keys in priority order for production surfaces.
const PRODUCTION_PRIORITY = ['mainnet', 'testnet', 'localnet'];

function normalizeNetworkKey(value) {
  const key = String(value || '').trim().toLowerCase();
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

// Production default: mainnet whenever it is available, otherwise testnet,
// otherwise localnet. This is the default for Explorer/admin-style reads and
// for every generic `getNetworkConfig()` call without an argument.
export function getDefaultExplorerNetwork() {
  for (const key of PRODUCTION_PRIORITY) {
    if (NETWORKS[key]?.available) return key;
  }
  return 'mainnet';
}

export function getDefaultNetwork() {
  return getDefaultExplorerNetwork();
}

// Test-only surfaces (Test Console / network console, nft-demo, Social E2E,
// developer testing/simulation) must stay pinned to the test server and must
// never silently follow mainnet. Localnet is the fallback so local `vite dev`
// without testnet env still exercises the same code paths against loopback
// (or explicit AEKO_LOCALNET_* env, which overrides hardcoded localhost).
export function getTestNetwork() {
  if (NETWORKS.testnet.available) return 'testnet';
  if (NETWORKS.localnet.available) return 'localnet';
  return 'testnet';
}

export function getTestNetworkConfig() {
  return NETWORKS[getTestNetwork()];
}

export function isTestSurfaceNetwork(network) {
  const key = normalizeNetworkKey(network) || String(network || '').toLowerCase();
  return key === 'testnet' || key === 'localnet' || key === 'devnet';
}

// Resolve a requested network honoring availability; unknown or unavailable
// values fall back to the production default (mainnet-first).
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

export function isMainnetConfig(config) {
  return config?.key === 'mainnet';
}

export function isTestnetConfig(config) {
  return config?.key === 'testnet';
}
