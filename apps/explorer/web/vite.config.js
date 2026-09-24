import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const clean = (value) => String(value || '').trim()

function networkFromEnv(env, prefix, { funding = false } = {}) {
  const config = {
    rpcUrl: clean(env[`${prefix}_RPC_URL`]),
    websocketUrl: clean(env[`${prefix}_WS_URL`]),
    explorerApiUrl: clean(env[`${prefix}_EXPLORER_API_URL`]),
    explorerUrl: clean(env[`${prefix}_EXPLORER_URL`]),
  }

  if (funding) {
    config.fundingUrl = clean(env[`${prefix}_FUNDING_URL`])
  }

  return config
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

  const testnet = networkFromEnv(env, 'AEKO_PUBLIC', { funding: true })
  const mainnet = networkFromEnv(env, 'AEKO_MAINNET')
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
          ...(hasAnyValue(mainnet) ? { mainnet } : {}),
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
