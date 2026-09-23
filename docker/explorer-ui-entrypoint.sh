#!/bin/sh
set -eu

: "${AEKO_PUBLIC_RPC_URL:?AEKO_PUBLIC_RPC_URL is required}"
: "${AEKO_PUBLIC_WS_URL:?AEKO_PUBLIC_WS_URL is required}"
: "${AEKO_PUBLIC_EXPLORER_API_URL:?AEKO_PUBLIC_EXPLORER_API_URL is required}"
: "${AEKO_PUBLIC_EXPLORER_URL:?AEKO_PUBLIC_EXPLORER_URL is required}"
: "${AEKO_PUBLIC_FUNDING_URL:?AEKO_PUBLIC_FUNDING_URL is required}"

node <<'NODE'
const fs = require('fs');

const optional = (name) => String(process.env[name] || '').trim();

const parsePublicHttpUrl = (name, value) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL; received ${JSON.stringify(value)}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use http or https; received ${parsed.protocol}`);
  }
  return parsed;
};

const endpointKey = (parsed) => {
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  return `${parsed.protocol}//${parsed.host}${path}`;
};

const explorerApi = parsePublicHttpUrl(
  'AEKO_PUBLIC_EXPLORER_API_URL',
  optional('AEKO_PUBLIC_EXPLORER_API_URL'),
);
const explorerUi = parsePublicHttpUrl(
  'AEKO_PUBLIC_EXPLORER_URL',
  optional('AEKO_PUBLIC_EXPLORER_URL'),
);

if (endpointKey(explorerApi) === endpointKey(explorerUi)) {
  throw new Error(
    'AEKO_PUBLIC_EXPLORER_API_URL resolves to the Explorer UI endpoint. '
      + 'Route the API URL to explorer-api:8088 and the UI URL to explorer-ui:4000.',
  );
}

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
