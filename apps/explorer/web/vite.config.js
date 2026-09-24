import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const clean = (value) => String(value || '').trim()

function testnetFromEnv(env) {
  return {
    rpcUrl: clean(env.AEKO_TESTNET_RPC_URL),
    websocketUrl: clean(env.AEKO_TESTNET_WS_URL),
    explorerApiUrl: clean(env.AEKO_TESTNET_EXPLORER_API_URL),
    explorerUrl: clean(env.AEKO_TESTNET_EXPLORER_URL),
    fundingUrl: clean(env.AEKO_TESTNET_FUNDING_URL),
  }
}

function hasAnyValue(config) {
  return Object.values(config).some(Boolean)
}

// Local Vite development is the only place .env files are compiled into the
// browser bundle. Production builds intentionally receive an empty dev config;
// docker/explorer-ui-entrypoint.sh injects deployment endpoints at container
// startup instead.
export default defineConfig(({ command, mode }) => {
  const env = command === 'serve' ? loadEnv(mode, process.cwd(), '') : {}

  const testnet = testnetFromEnv(env)
  const demo = {
    rpcUrl: clean(env.AEKO_DEMO_RPC_URL),
    collection: clean(env.AEKO_DEMO_COLLECTION),
    token: clean(env.AEKO_DEMO_TOKEN),
    metadataUri: clean(env.AEKO_DEMO_METADATA_URI),
  }

  const devRuntimeConfig =
    command === 'serve'
      ? {
          ...(hasAnyValue(testnet) ? { testnet } : {}),
          ...(hasAnyValue(demo) ? { demo } : {}),
        }
      : {}

  return {
    plugins: [react()],
    define: {
      'globalThis.__AEKO_DEV_RUNTIME_CONFIG__': JSON.stringify(devRuntimeConfig),
    },
  }
})
