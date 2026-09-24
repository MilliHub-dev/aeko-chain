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

const testnet = {
  rpcUrl: optional('AEKO_PUBLIC_RPC_URL'),
  websocketUrl: optional('AEKO_PUBLIC_WS_URL'),
  explorerApiUrl: optional('AEKO_PUBLIC_EXPLORER_API_URL'),
  explorerUrl: optional('AEKO_PUBLIC_EXPLORER_URL'),
  fundingUrl: optional('AEKO_PUBLIC_FUNDING_URL'),
};

const explorerApi = parsePublicHttpUrl(
  'AEKO_PUBLIC_EXPLORER_API_URL',
  testnet.explorerApiUrl,
);
const explorerUi = parsePublicHttpUrl(
  'AEKO_PUBLIC_EXPLORER_URL',
  testnet.explorerUrl,
);

if (endpointKey(explorerApi) === endpointKey(explorerUi)) {
  throw new Error(
    'AEKO_PUBLIC_EXPLORER_API_URL resolves to the Explorer UI endpoint. '
      + 'Route the API URL to explorer-api:8088 and the UI URL to explorer-ui:4000.',
  );
}

const mainnet = {
  rpcUrl: optional('AEKO_MAINNET_RPC_URL'),
  websocketUrl: optional('AEKO_MAINNET_WS_URL'),
  explorerApiUrl: optional('AEKO_MAINNET_EXPLORER_API_URL'),
  explorerUrl: optional('AEKO_MAINNET_EXPLORER_URL'),
};

const mainnetValues = Object.values(mainnet);
if (mainnetValues.some(Boolean) && !mainnetValues.every(Boolean)) {
  const missing = Object.entries(mainnet)
    .filter(([, value]) => !value)
    .map(([key]) => key)
    .join(', ');
  throw new Error(`AEKO mainnet Explorer configuration is partial. Missing: ${missing}.`);
}

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
