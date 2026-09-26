import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const invokedCommand = process.argv[2]
if (
  (invokedCommand === 'build' || invokedCommand === 'preview')
  && process.env.NODE_ENV
  && !['production', 'development', 'test'].includes(process.env.NODE_ENV)
) {
  process.env.NODE_ENV = 'production'
}

const clean = (value) => String(value || '').trim()
const NETWORKS = ['mainnet', 'testnet', 'devnet', 'localnet']

function normalizeNetwork(value) {
  const network = clean(value).toLowerCase()
  return NETWORKS.includes(network) ? network : ''
}

function readAlternative(env, network) {
  const prefix = `AEKO_${network.toUpperCase()}`
  const rpcUrl = clean(env[`${prefix}_RPC_URL`])
  const websocketUrl = clean(env[`${prefix}_WS_URL`])
  const upstream = clean(env[`${prefix}_EXPLORER_API_URL`])
  const values = [rpcUrl, websocketUrl, upstream]

  if (values.some(Boolean) && !values.every(Boolean)) {
    throw new Error(
      `${network} Scan configuration is partial. Set ${prefix}_RPC_URL, `
      + `${prefix}_WS_URL and ${prefix}_EXPLORER_API_URL together.`,
    )
  }

  if (!values.every(Boolean)) return null
  return { rpcUrl, websocketUrl, upstream }
}

export default defineConfig(({ command, mode }) => {
  const env = command === 'serve' ? loadEnv(mode, process.cwd(), '') : {}
  const activeNetwork = normalizeNetwork(env.AEKO_NETWORK) || 'localnet'

  let activeRpc = clean(env.AEKO_RPC_URL)
  let activeWs = clean(env.AEKO_WS_URL)
  let activeUpstream = clean(env.AEKO_EXPLORER_API_URL)

  if (command === 'serve' && activeNetwork === 'localnet') {
    activeRpc ||= 'http://127.0.0.1:8899'
    activeWs ||= 'ws://127.0.0.1:8900'
    activeUpstream ||= 'http://127.0.0.1:8088'
  }

  const activeValues = [activeRpc, activeWs, activeUpstream]
  if (command === 'serve' && !activeValues.every(Boolean)) {
    throw new Error(
      'Active Scan network is incomplete. Set AEKO_RPC_URL, AEKO_WS_URL and '
      + 'AEKO_EXPLORER_API_URL together.',
    )
  }

  const alternatives = Object.fromEntries(
    NETWORKS.map((network) => [network, readAlternative(env, network)]),
  )
  alternatives[activeNetwork] = {
    rpcUrl: activeRpc,
    websocketUrl: activeWs,
    upstream: activeUpstream,
  }

  const devRuntimeConfig = command === 'serve'
    ? {
        network: activeNetwork,
        networks: Object.fromEntries(
          NETWORKS
            .filter((network) => alternatives[network])
            .map((network) => [
              network,
              {
                rpcUrl: alternatives[network].rpcUrl,
                websocketUrl: alternatives[network].websocketUrl,
                explorerApiUrl: `/api/explorer/${network}`,
                ...(network === 'mainnet'
                  ? {}
                  : { fundingUrl: `/api/explorer/${network}` }),
              },
            ]),
        ),
        demo: {
          rpcUrl: clean(env.AEKO_DEMO_RPC_URL),
          collection: clean(env.AEKO_DEMO_COLLECTION),
          token: clean(env.AEKO_DEMO_TOKEN),
          metadataUri: clean(env.AEKO_DEMO_METADATA_URI),
        },
      }
    : {}

  const proxy = {}
  for (const network of NETWORKS) {
    const target = alternatives[network]?.upstream
    if (!target) continue
    const prefix = `/api/explorer/${network}`
    proxy[prefix] = {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(new RegExp(`^${prefix}`), '') || '/',
    }
  }

  return {
    plugins: [react()],
    define: {
      'globalThis.__AEKO_DEV_RUNTIME_CONFIG__': JSON.stringify(devRuntimeConfig),
    },
    server: { proxy },
  }
})
