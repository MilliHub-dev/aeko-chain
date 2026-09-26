import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// `vite build` / `vite preview` always produce production artifacts. An ambient
// NODE_ENV=local (the local-deploy workflow) must not leak dev-mode defines
// into built assets — Vite only supports development/production/test here.
// The deploy env travels via injected runtime config, not NODE_ENV.
const invokedCommand = process.argv[2]
if (
  (invokedCommand === 'build' || invokedCommand === 'preview')
  && process.env.NODE_ENV
  && !['production', 'development', 'test'].includes(process.env.NODE_ENV)
) {
  process.env.NODE_ENV = 'production'
}

const clean = (value) => String(value || '').trim()

function hasAll(values) {
  return values.every(Boolean)
}

function normalizeDeployEnv(value) {
  const normalized = clean(value).toLowerCase()
  if (['local', 'development', 'dev', 'localhost'].includes(normalized)) return 'local'
  if (normalized === 'testnet') return 'testnet'
  if (['production', 'prod', 'preview', 'staging'].includes(normalized)) return 'production'
  return ''
}

// Env priority rule: explicit AEKO_* env values always win over hardcoded
// loopback defaults. Hardcoded localhost is a last resort for local deploys
// only, never a silent override for configured values.
//
// Deploy rule: local deploys expose ONLY localnet, testnet deploys expose
// ONLY testnet, production deploys expose testnet + mainnet.

export default defineConfig(({ command, mode }) => {
  const env = command === 'serve' ? loadEnv(mode, process.cwd(), '') : {}
  // `vite` (serve) is a local deploy unless the env explicitly says
  // otherwise. AEKO_ENV is the primary switch (it lives in .env files);
  // NODE_ENV is honored as a fallback. `vite build` output is
  // environment-neutral; the production container entrypoint injects the
  // real deploy env at startup.
  const deployEnv = command === 'serve'
    ? normalizeDeployEnv(env.AEKO_ENV || process.env.NODE_ENV) || 'local'
    : normalizeDeployEnv(env.AEKO_ENV || process.env.NODE_ENV) || 'production'
  const isLocalDeploy = deployEnv === 'local'
  const isTestnetDeploy = deployEnv === 'testnet'

  const testnetRpc = clean(env.AEKO_TESTNET_RPC_URL || env.AEKO_PUBLIC_RPC_URL)
  const testnetWs = clean(env.AEKO_TESTNET_WS_URL || env.AEKO_PUBLIC_WS_URL)
  const testnetUpstream = clean(
    env.AEKO_TESTNET_EXPLORER_API_URL || env.AEKO_INTERNAL_EXPLORER_API_URL,
  )

  const mainnetRpc = clean(env.AEKO_MAINNET_RPC_URL)
  const mainnetWs = clean(env.AEKO_MAINNET_WS_URL)
  const mainnetUpstream = clean(
    env.AEKO_MAINNET_EXPLORER_API_URL || env.AEKO_INTERNAL_MAINNET_EXPLORER_API_URL,
  )
  const mainnetConfigured = hasAll([mainnetRpc, mainnetWs, mainnetUpstream])

  if (!isLocalDeploy && [mainnetRpc, mainnetWs, mainnetUpstream].some(Boolean) && !mainnetConfigured) {
    throw new Error(
      'AEKO mainnet dev configuration is partial. Set AEKO_MAINNET_RPC_URL, '
        + 'AEKO_MAINNET_WS_URL and AEKO_MAINNET_EXPLORER_API_URL together.',
    )
  }

  // Explicit localnet env overrides hardcoded loopback. Any single value
  // opts into localnet; RPC/WS/API fall back to loopback only for the pieces
  // that are not explicitly set.
  const localnetRpcEnv = clean(env.AEKO_LOCALNET_RPC_URL)
  const localnetWsEnv = clean(env.AEKO_LOCALNET_WS_URL)
  const localnetUpstreamEnv = clean(
    env.AEKO_LOCALNET_EXPLORER_API_URL || env.AEKO_INTERNAL_LOCALNET_EXPLORER_API_URL,
  )
  const localnetEnvConfigured = [localnetRpcEnv, localnetWsEnv, localnetUpstreamEnv]
    .some(Boolean)
  const localnetRpc = localnetRpcEnv || (localnetEnvConfigured ? 'http://127.0.0.1:8899' : '')
  const localnetWs = localnetWsEnv || (localnetEnvConfigured ? 'ws://127.0.0.1:8900' : '')
  const localnetUpstream = localnetUpstreamEnv || (localnetEnvConfigured ? 'http://127.0.0.1:8088' : '')

  const testnetValues = [testnetRpc, testnetWs]
  const testnetConfigured = hasAll(testnetValues)
  if (!isLocalDeploy && testnetValues.some(Boolean) && !testnetConfigured) {
    throw new Error(
      'AEKO testnet dev configuration is partial. Set AEKO_TESTNET_RPC_URL and '
        + 'AEKO_TESTNET_WS_URL together.',
    )
  }

  // Testnet-mode dev fallback: with no testnet endpoints configured, point
  // testnet at loopback so zero-config `vite dev` still works. Explicit env
  // always wins; production containers never get this fallback.
  const testnetLoopback = command === 'serve' && isTestnetDeploy && !testnetConfigured
    ? { rpcUrl: 'http://127.0.0.1:8899', websocketUrl: 'ws://127.0.0.1:8900' }
    : null
  const testnetUpstreamTarget = testnetUpstream
    || (testnetLoopback ? 'http://127.0.0.1:8088' : '')

  const localnetValues = localnetEnvConfigured ? [localnetRpc, localnetWs] : []
  const localnetConfigured = localnetEnvConfigured && hasAll(localnetValues)

  const devRuntimeConfig =
    command === 'serve'
      ? {
          env: deployEnv,
          // Local deploys expose only localnet; testnet deploys expose only
          // testnet (loopback when unconfigured); production exposes
          // testnet + mainnet.
          ...(!isLocalDeploy && (testnetConfigured || testnetLoopback)
            ? {
                testnet: {
                  rpcUrl: testnetLoopback?.rpcUrl || testnetRpc,
                  websocketUrl: testnetLoopback?.websocketUrl || testnetWs,
                  explorerApiUrl: '/api/explorer/testnet',
                  fundingUrl: '/api/explorer/testnet',
                },
              }
            : {}),
          ...(!isLocalDeploy && !isTestnetDeploy && mainnetConfigured
            ? {
                mainnet: {
                  rpcUrl: mainnetRpc,
                  websocketUrl: mainnetWs,
                  explorerApiUrl: '/api/explorer/mainnet',
                },
              }
            : {}),
          ...(isLocalDeploy && localnetConfigured
            ? {
                localnet: {
                  rpcUrl: localnetRpc,
                  websocketUrl: localnetWs,
                  explorerApiUrl: '/api/explorer/localnet',
                  fundingUrl: '/api/explorer/localnet',
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

  // Dev proxy upstreams: explicit env wins. In local deploys the localnet
  // proxy falls back to loopback so zero-config `vite dev` works against a
  // local backend; in testnet deploys the testnet proxy falls back the same
  // way. Other networks have no loopback fallback.
  const localnetProxyTarget =
    localnetUpstream || (isLocalDeploy && !testnetUpstream && !mainnetUpstream
      ? 'http://127.0.0.1:8088'
      : '')

  return {
    plugins: [react()],
    define: {
      'globalThis.__AEKO_DEV_RUNTIME_CONFIG__': JSON.stringify(devRuntimeConfig),
    },
    server: {
      proxy: {
        ...(testnetUpstreamTarget
          ? {
              '/api/explorer/testnet': {
                target: testnetUpstreamTarget,
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
        ...(localnetProxyTarget
          ? {
              '/api/explorer/localnet': {
                target: localnetProxyTarget,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/explorer\/localnet/, '') || '/',
              },
            }
          : {}),
      },
    },
  }
})
