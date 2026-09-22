#!/bin/sh
set -eu

: "${AEKO_PUBLIC_RPC_URL:?AEKO_PUBLIC_RPC_URL is required}"
: "${AEKO_PUBLIC_WS_URL:?AEKO_PUBLIC_WS_URL is required}"
: "${AEKO_PUBLIC_EXPLORER_API_URL:?AEKO_PUBLIC_EXPLORER_API_URL is required}"
: "${AEKO_PUBLIC_FUNDING_URL:?AEKO_PUBLIC_FUNDING_URL is required}"

node <<'NODE'
const fs = require('fs');

const optional = (name) => String(process.env[name] || '').trim();
const config = {
  rpcUrl: optional('AEKO_PUBLIC_RPC_URL'),
  websocketUrl: optional('AEKO_PUBLIC_WS_URL'),
  explorerApiUrl: optional('AEKO_PUBLIC_EXPLORER_API_URL'),
  explorerUrl: optional('AEKO_PUBLIC_EXPLORER_URL'),
  fundingUrl: optional('AEKO_PUBLIC_FUNDING_URL'),
  mainnetRpcUrl: optional('AEKO_MAINNET_RPC_URL'),
  mainnetWebsocketUrl: optional('AEKO_MAINNET_WS_URL'),
  mainnetExplorerApiUrl: optional('AEKO_MAINNET_EXPLORER_API_URL'),
  mainnetExplorerUrl: optional('AEKO_MAINNET_EXPLORER_URL'),
  demoRpcUrl: optional('AEKO_DEMO_RPC_URL'),
  demoCollection: optional('AEKO_DEMO_COLLECTION'),
  demoToken: optional('AEKO_DEMO_TOKEN'),
  demoMetadataUri: optional('AEKO_DEMO_METADATA_URI'),
};

fs.writeFileSync(
  '/app/dist/runtime-config.js',
  `window.__AEKO_RUNTIME_CONFIG__ = ${JSON.stringify(config)};\n`,
  'utf8',
);
NODE

exec "$@"
