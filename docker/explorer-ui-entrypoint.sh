#!/bin/sh
set -eu

: "${AEKO_PUBLIC_RPC_URL:?AEKO_PUBLIC_RPC_URL is required}"
: "${AEKO_PUBLIC_WS_URL:?AEKO_PUBLIC_WS_URL is required}"
: "${AEKO_PUBLIC_FUNDING_URL:?AEKO_PUBLIC_FUNDING_URL is required}"

node <<'NODE'
const fs = require('fs');

const optional = (name) => String(process.env[name] || '').trim();

const testnet = {
  rpcUrl: optional('AEKO_PUBLIC_RPC_URL'),
  websocketUrl: optional('AEKO_PUBLIC_WS_URL'),
  explorerApiUrl: '/api/explorer/testnet',
  fundingUrl: optional('AEKO_PUBLIC_FUNDING_URL'),
};

const mainnetRpcUrl = optional('AEKO_MAINNET_RPC_URL');
const mainnetWebsocketUrl = optional('AEKO_MAINNET_WS_URL');
const mainnetExplorerUpstream = optional('AEKO_INTERNAL_MAINNET_EXPLORER_API_URL');
const mainnetValues = [mainnetRpcUrl, mainnetWebsocketUrl, mainnetExplorerUpstream];

if (mainnetValues.some(Boolean) && !mainnetValues.every(Boolean)) {
  const missing = [
    ['AEKO_MAINNET_RPC_URL', mainnetRpcUrl],
    ['AEKO_MAINNET_WS_URL', mainnetWebsocketUrl],
    ['AEKO_INTERNAL_MAINNET_EXPLORER_API_URL', mainnetExplorerUpstream],
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

const demo = {
  rpcUrl: optional('AEKO_DEMO_RPC_URL'),
  collection: optional('AEKO_DEMO_COLLECTION'),
  token: optional('AEKO_DEMO_TOKEN'),
  metadataUri: optional('AEKO_DEMO_METADATA_URI'),
};

const config = { testnet, mainnet, demo };

fs.writeFileSync(
  '/app/dist/runtime-config.js',
  `window.__AEKO_RUNTIME_CONFIG__ = ${JSON.stringify(config)};\n`,
  'utf8',
);
NODE

exec "$@"
