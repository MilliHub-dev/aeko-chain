import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const clean = (value) => String(value || '').trim()

function hasAll(values) {
  return values.every(Boolean)
}

export default defineConfig(({ command, mode }) => {
  const env = command === 'serve' ? loadEnv(mode, process.cwd(), '') : {}

  const publicRpc = clean(env.AEKO_PUBLIC_RPC_URL)
  const publicWs = clean(env.AEKO_PUBLIC_WS_URL)
  const publicFunding = clean(env.AEKO_PUBLIC_FUNDING_URL)
  const testnetUpstream = clean(env.AEKO_INTERNAL_EXPLORER_API_URL) || 'http://127.0.0.1:8088'

  const mainnetRpc = clean(env.AEKO_MAINNET_RPC_URL)
  const mainnetWs = clean(env.AEKO_MAINNET_WS_URL)
  const mainnetUpstream = clean(env.AEKO_INTERNAL_MAINNET_EXPLORER_API_URL)
  const mainnetConfigured = hasAll([mainnetRpc, mainnetWs, mainnetUpstream])

  if ([mainnetRpc, mainnetWs, mainnetUpstream].some(Boolean) && !mainnetConfigured) {
    throw new Error(
      'AEKO mainnet dev configuration is partial. Set AEKO_MAINNET_RPC_URL, '
        + 'AEKO_MAINNET_WS_URL and AEKO_INTERNAL_MAINNET_EXPLORER_API_URL together.',
    )
  }

  const testnetConfigured = hasAll([publicRpc, publicWs])
  const devRuntimeConfig =
    command === 'serve'
      ? {
          ...(testnetConfigured
            ? {
                testnet: {
                  rpcUrl: publicRpc,
                  websocketUrl: publicWs,
                  explorerApiUrl: '/api/explorer/testnet',
                  fundingUrl: publicFunding,
                },
              }
            : {}),
          ...(mainnetConfigured
            ? {
                mainnet: {
                  rpcUrl: mainnetRpc,
                  websocketUrl: mainnetWs,
                  explorerApiUrl: '/api/explorer/mainnet',
                },
              }
            : {}),
          demo: {
            rpcUrl: clean(env.AEKO_DEMO_RPC_URL),
            collection: clean(env.AEKO_DEMO_COLLECTION),
            token: clean(env.AEKO_DEMO_TOKEN),
            metadataUri: clean(env.AEKO_DEMO_METADATA_URI),
          },
        }
      : {}

  return {
    plugins: [react()],
    define: {
      'globalThis.__AEKO_DEV_RUNTIME_CONFIG__': JSON.stringify(devRuntimeConfig),
    },
    server: {
      proxy: {
        '/api/explorer/testnet': {
          target: testnetUpstream,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/explorer\/testnet/, '') || '/',
        },
        ...(mainnetUpstream
          ? {
              '/api/explorer/mainnet': {
                target: mainnetUpstream,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/explorer\/mainnet/, '') || '/',
              },
            }
          : {}),
      },
    },
  }
})
