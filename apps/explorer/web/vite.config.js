import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const clean = (value) => String(value || '').trim()

function hasAll(values) {
  return values.every(Boolean)
}

// Env priority rule: explicit AEKO_* env values always win over hardcoded
// loopback defaults. Hardcoded localhost is a last resort for local `vite
// dev` only, never a silent override for configured values.

export default defineConfig(({ command, mode }) => {
  const env = command === 'serve' ? loadEnv(mode, process.cwd(), '') : {}

  const publicRpc = clean(env.AEKO_PUBLIC_RPC_URL)
  const publicWs = clean(env.AEKO_PUBLIC_WS_URL)
  const publicFunding = clean(env.AEKO_PUBLIC_FUNDING_URL)
  const testnetUpstream = clean(env.AEKO_INTERNAL_EXPLORER_API_URL)

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

  // Explicit localnet env overrides hardcoded loopback. Any single value
  // opts into localnet; RPC/WS/API fall back to loopback only for the pieces
  // that are not explicitly set.
  const localnetRpcEnv = clean(env.AEKO_LOCALNET_RPC_URL)
  const localnetWsEnv = clean(env.AEKO_LOCALNET_WS_URL)
  const localnetFundingEnv = clean(env.AEKO_LOCALNET_FUNDING_URL)
  const localnetUpstreamEnv = clean(env.AEKO_INTERNAL_LOCALNET_EXPLORER_API_URL)
  const localnetEnvConfigured = [localnetRpcEnv, localnetWsEnv, localnetFundingEnv, localnetUpstreamEnv]
    .some(Boolean)
  const localnetRpc = localnetRpcEnv || (localnetEnvConfigured ? 'http://127.0.0.1:8899' : '')
  const localnetWs = localnetWsEnv || (localnetEnvConfigured ? 'ws://127.0.0.1:8900' : '')
  const localnetUpstream = localnetUpstreamEnv || (localnetEnvConfigured ? 'http://127.0.0.1:8088' : '')

  const testnetValues = [publicRpc, publicWs]
  const testnetConfigured = hasAll(testnetValues)
  if (testnetValues.some(Boolean) && !testnetConfigured) {
    throw new Error(
      'AEKO testnet dev configuration is partial. Set AEKO_PUBLIC_RPC_URL and '
        + 'AEKO_PUBLIC_WS_URL together.',
    )
  }

  const localnetValues = localnetEnvConfigured ? [localnetRpc, localnetWs] : []
  const localnetConfigured = localnetEnvConfigured && hasAll(localnetValues)

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
          ...(localnetConfigured
            ? {
                localnet: {
                  rpcUrl: localnetRpc,
                  websocketUrl: localnetWs,
                  explorerApiUrl: '/api/explorer/localnet',
                  fundingUrl: localnetFundingEnv,
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

  // Dev proxy upstreams: explicit env wins. Testnet falls back to loopback
  // only when nothing else is configured (preserves `vite dev` zero-config
  // local boot); localnet proxy exists only when localnet env opted in.
  const testnetProxyTarget =
    testnetUpstream || (!mainnetConfigured && !localnetEnvConfigured ? 'http://127.0.0.1:8088' : '')

  return {
    plugins: [react()],
    define: {
      'globalThis.__AEKO_DEV_RUNTIME_CONFIG__': JSON.stringify(devRuntimeConfig),
    },
    server: {
      proxy: {
        ...(testnetProxyTarget
          ? {
              '/api/explorer/testnet': {
                target: testnetProxyTarget,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/explorer\/testnet/, '') || '/',
              },
            }
          : {}),
        ...(mainnetUpstream
          ? {
              '/api/explorer/mainnet': {
                target: mainnetUpstream,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/explorer\/mainnet/, '') || '/',
              },
            }
          : {}),
        ...(localnetUpstream
          ? {
              '/api/explorer/localnet': {
                target: localnetUpstream,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/explorer\/localnet/, '') || '/',
              },
            }
          : {}),
      },
    },
  }
})
