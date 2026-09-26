#!/bin/sh
set -eu

normalizeDeployEnv() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    local|development|dev|localhost) printf 'local' ;;
    testnet) printf 'testnet' ;;
    *) printf 'production' ;;
  esac
}

# Deploy rule: local deploys expose ONLY localnet (testnet env not required);
# testnet deploys expose ONLY testnet; production deploys expose testnet +
# mainnet.
AEKO_DEPLOY_ENV="$(normalizeDeployEnv "${AEKO_ENV:-${NODE_ENV:-}}")"
export AEKO_DEPLOY_ENV

if [ "$AEKO_DEPLOY_ENV" != "local" ]; then
  : "${AEKO_TESTNET_RPC_URL:?AEKO_TESTNET_RPC_URL is required}"
  : "${AEKO_TESTNET_WS_URL:?AEKO_TESTNET_WS_URL is required}"
fi

node <<'NODE'
const fs = require('fs');

const optional = (name) => String(process.env[name] || '').trim();

function normalizeDeployEnv(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['local', 'development', 'dev', 'localhost'].includes(normalized)) return 'local';
  if (normalized === 'testnet') return 'testnet';
  return 'production';
}

// Deploy rule: local deploys expose ONLY localnet; testnet deploys expose
// ONLY testnet; production deploys expose testnet + mainnet.
// AEKO_DEPLOY_ENV is exported by the shell wrapper above.
const deployEnv = normalizeDeployEnv(optional('AEKO_ENV') || process.env.AEKO_DEPLOY_ENV || process.env.NODE_ENV);
const isLocalDeploy = deployEnv === 'local';
const isTestnetDeploy = deployEnv === 'testnet';

const testnet = {
  rpcUrl: optional('AEKO_TESTNET_RPC_URL'),
  websocketUrl: optional('AEKO_TESTNET_WS_URL'),
  explorerApiUrl: '/api/explorer/testnet',
  fundingUrl: '/api/explorer/testnet',
};

const mainnetRpcUrl = optional('AEKO_MAINNET_RPC_URL');
const mainnetWebsocketUrl = optional('AEKO_MAINNET_WS_URL');
const mainnetExplorerUpstream = optional('AEKO_MAINNET_EXPLORER_API_URL');
const mainnetValues = [mainnetRpcUrl, mainnetWebsocketUrl, mainnetExplorerUpstream];

if (mainnetValues.some(Boolean) && !mainnetValues.every(Boolean)) {
  const missing = [
    ['AEKO_MAINNET_RPC_URL', mainnetRpcUrl],
    ['AEKO_MAINNET_WS_URL', mainnetWebsocketUrl],
    ['AEKO_MAINNET_EXPLORER_API_URL', mainnetExplorerUpstream],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)
    .join(', ');
  throw new Error(`AEKO mainnet Explorer configuration is partial. Missing: ${missing}.`);
}

const mainnet = {
  rpcUrl: mainnetRpcUrl,
  websocketUrl: mainnetWebsocketUrl,
  explorerApiUrl: mainnetValues.every(Boolean) ? '/api/explorer/mainnet' : '',
};

// Localnet: explicit env always overrides hardcoded loopback. Any single
// AEKO_LOCALNET_* value opts into localnet; unset RPC/WS pieces fall back to
// loopback for local Compose runs.
const localnetRpcEnv = optional('AEKO_LOCALNET_RPC_URL');
const localnetWsEnv = optional('AEKO_LOCALNET_WS_URL');
const localnetUpstreamEnv = optional('AEKO_LOCALNET_EXPLORER_API_URL');
const localnetEnvSet = [localnetRpcEnv, localnetWsEnv, localnetUpstreamEnv].some(Boolean);
const localnet = {
  rpcUrl: localnetRpcEnv || (localnetEnvSet ? 'http://127.0.0.1:8899' : ''),
  websocketUrl: localnetWsEnv || (localnetEnvSet ? 'ws://127.0.0.1:8900' : ''),
  explorerApiUrl: localnetEnvSet ? '/api/explorer/localnet' : '',
  fundingUrl: localnetUpstreamEnv ? '/api/explorer/localnet' : '',
};

const demo = {
  rpcUrl: optional('AEKO_DEMO_RPC_URL'),
  collection: optional('AEKO_DEMO_COLLECTION'),
  token: optional('AEKO_DEMO_TOKEN'),
  metadataUri: optional('AEKO_DEMO_METADATA_URI'),
};

const config = {
  env: deployEnv,
  // Local deploys expose ONLY localnet, testnet deploys ONLY testnet;
  // production deploys expose testnet + mainnet. The browser enforces the
  // same rule, this keeps the injected payload honest too.
  testnet: isLocalDeploy
    ? { rpcUrl: '', websocketUrl: '', explorerApiUrl: '', fundingUrl: '' }
    : testnet,
  mainnet: isLocalDeploy || isTestnetDeploy
    ? { rpcUrl: '', websocketUrl: '', explorerApiUrl: '' }
    : mainnet,
  localnet,
  demo,
};

fs.writeFileSync(
  '/app/dist/runtime-config.js',
  `window.__AEKO_RUNTIME_CONFIG__ = ${JSON.stringify(config)};\n`,
  'utf8',
);
NODE

exec "$@"
