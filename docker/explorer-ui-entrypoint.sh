#!/bin/sh
set -eu

normalize_network() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    mainnet|testnet|devnet|localnet) printf '%s' "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" ;;
    *) return 1 ;;
  esac
}

AEKO_ACTIVE_NETWORK="$(normalize_network "${AEKO_NETWORK:-}")" || {
  echo "error: AEKO_NETWORK must be mainnet, testnet, devnet, or localnet" >&2
  exit 64
}
export AEKO_ACTIVE_NETWORK

: "${AEKO_RPC_URL:?AEKO_RPC_URL is required for the active Scan network}"
: "${AEKO_WS_URL:?AEKO_WS_URL is required for the active Scan network}"
: "${AEKO_EXPLORER_API_URL:?AEKO_EXPLORER_API_URL is required for the active Scan network}"

node <<'NODE'
const fs = require('fs');

const optional = (name) => String(process.env[name] || '').trim();
const activeNetwork = optional('AEKO_ACTIVE_NETWORK');

function readAlternative(network) {
  const prefix = `AEKO_${network.toUpperCase()}`;
  const rpcUrl = optional(`${prefix}_RPC_URL`);
  const websocketUrl = optional(`${prefix}_WS_URL`);
  const upstream = optional(`${prefix}_EXPLORER_API_URL`);
  const values = [rpcUrl, websocketUrl, upstream];
  if (values.some(Boolean) && !values.every(Boolean)) {
    const missing = [
      [`${prefix}_RPC_URL`, rpcUrl],
      [`${prefix}_WS_URL`, websocketUrl],
      [`${prefix}_EXPLORER_API_URL`, upstream],
    ].filter(([, value]) => !value).map(([name]) => name).join(', ');
    throw new Error(`${network} Scan configuration is partial. Missing: ${missing}.`);
  }
  if (!values.every(Boolean)) return null;
  return {
    rpcUrl,
    websocketUrl,
    explorerApiUrl: `/api/explorer/${network}`,
    ...(network === 'mainnet' ? {} : { fundingUrl: `/api/explorer/${network}` }),
  };
}

const networks = {};
for (const network of ['mainnet', 'testnet', 'devnet', 'localnet']) {
  const alternative = readAlternative(network);
  if (alternative) networks[network] = alternative;
}

// Generic endpoints always own the currently active/default network. This
// avoids requiring network-prefixed variables on the server that hosts that
// chain while still allowing Scan to reach other independently deployed nets.
networks[activeNetwork] = {
  rpcUrl: optional('AEKO_RPC_URL'),
  websocketUrl: optional('AEKO_WS_URL'),
  explorerApiUrl: `/api/explorer/${activeNetwork}`,
  ...(activeNetwork === 'mainnet'
    ? {}
    : { fundingUrl: `/api/explorer/${activeNetwork}` }),
};

const demo = {
  rpcUrl: optional('AEKO_DEMO_RPC_URL'),
  collection: optional('AEKO_DEMO_COLLECTION'),
  token: optional('AEKO_DEMO_TOKEN'),
  metadataUri: optional('AEKO_DEMO_METADATA_URI'),
};

fs.writeFileSync(
  '/app/dist/runtime-config.js',
  `window.__AEKO_RUNTIME_CONFIG__ = ${JSON.stringify({
    network: activeNetwork,
    networks,
    demo,
  })};\n`,
  'utf8',
);
NODE

exec "$@"
