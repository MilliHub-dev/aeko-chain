# AEKO network ports, domains, and service discovery

This is the canonical port and endpoint map for AEKO deployment. It covers the
chain-facing services in this repository. The separate Aeko product backend on
port `4101` is listed for context but is not deployed by these Compose files.

## Testnet domains and container ports

| Purpose | Canonical testnet endpoint | Runtime service | Container/listener port | Coolify routing |
| --- | --- | --- | ---: | --- |
| JSON-RPC | `https://rpc.aeko.online` | `validator` | `8899/tcp` | HTTPS domain -> `8899` |
| WebSocket / PubSub | `wss://ws.aeko.online` | `validator` | `8900/tcp` | WebSocket domain -> `8900` |
| Explorer / Scan API | `https://api.aeko.online` | `explorer-api` | `8088/tcp` | HTTPS domain -> `8088` |
| Bootstrap registry | `https://registry.aeko.online` | `registry` | `8089/tcp` | HTTPS domain -> `8089` |
| Aeko Scan UI | `https://scan.aeko.online` | `explorer-ui` | `4000/tcp` | HTTPS domain -> `4000` |
| Operations / Admin | `https://admin.aeko.online` | `operations-web` | `3001/tcp` | HTTPS domain -> `3001` |
| Faucet signer | `faucet.aeko.online:9900` | `faucet` | `9900/tcp` | **raw TCP**, not an HTTP domain |
| Validator gossip | `gossip.aeko.online:8001` | `validator` | `8001/tcp+udp` | direct DNS to Validator host |
| Validator dynamic transport | `gossip.aeko.online` host | `validator` | `8000-8050/tcp+udp` | direct host firewall/NAT |
| Validator local TPU/QUIC peer | no public domain | `validator` | default `8009` within dynamic range | internal/direct |
| PostgreSQL | no public AEKO domain | external/managed PostgreSQL | `5432/tcp` | private only |

There is **no separate public Funding Gateway service/domain in the current
target topology**. Testnet funding endpoints are owned by Explorer API and are
reached by browser clients through Aeko Scan's same-origin
`/api/explorer/testnet/funding/*` proxy. The private Faucet on `9900` remains
the low-level signer used by the Validator funding path.

The read-only registry exposes only:

- `/healthz`
- `/social-registry.env`
- `/protocol-registry.env`

All other registry paths return 404. The registry never mounts
`/data/aeko/keys`.

## Service discovery variables

Single-network services use one active network and generic endpoint variables:

| Variable | Meaning | Testnet value |
| --- | --- | --- |
| `AEKO_NETWORK` | active blockchain environment | `testnet` |
| `AEKO_RPC_URL` | active JSON-RPC URL | `https://rpc.aeko.online` |
| `AEKO_WS_URL` | active WebSocket URL | `wss://ws.aeko.online` |
| `AEKO_EXPLORER_API_URL` | active Explorer API URL | `https://api.aeko.online` |
| `AEKO_REGISTRY_URL` | active bootstrap registry URL | `https://registry.aeko.online` |
| `AEKO_FAUCET_ADDRESS` | active Faucet TCP address | `faucet.aeko.online:9900` |
| `AEKO_GOSSIP_HOST` | validator gossip hostname | `gossip.aeko.online` |

The same names are used for mainnet or devnet on those networks' own resource
sets. The values change to that network's domains. Do not put mainnet, testnet,
and devnet endpoints into every backend/validator deployment.

Aeko Scan is the multi-network exception. Its generic variables describe the
active/default network. Optional complete alternate triplets use:

`AEKO_<NETWORK>_RPC_URL`, `AEKO_<NETWORK>_WS_URL`, and
`AEKO_<NETWORK>_EXPLORER_API_URL` for `MAINNET`, `TESTNET`, `DEVNET`,
or `LOCALNET`.

## Monolithic/local Compose defaults and overrides

The all-in-one Compose files keep Docker service DNS as **server-side defaults**
where that is correct, but every dependency remains operator-overridable.

| Consumer | Default inside same Compose network | Override |
| --- | --- | --- |
| Social bootstrap -> Validator RPC | `http://validator:8899` | `AEKO_RPC_URL` |
| Protocol bootstrap -> Validator RPC | `http://validator:8899` | `AEKO_RPC_URL` |
| Explorer API -> Validator RPC | `http://validator:8899` | `AEKO_RPC_URL` |
| Explorer API -> Validator WS | `ws://validator:8900` | `AEKO_WS_URL` |
| Operations Web -> Validator RPC | `http://validator:8899` | `AEKO_RPC_URL` |
| Operations Web -> Explorer API | `http://explorer-api:8088` | `AEKO_EXPLORER_API_URL` |
| Validator -> Faucet | `faucet:9900` | `AEKO_FAUCET_ADDRESS` |
| Scan server -> Explorer API | `http://explorer-api:8088` | `AEKO_EXPLORER_API_URL` |

The Scan browser cannot resolve Docker service names. Public/testnet Compose
therefore gives Scan browser RPC/WS public-domain defaults while its server-side
Explorer proxy can still use `explorer-api:8088`. If you set the generic
endpoint variables in the deployment environment, those values override the
defaults.

Example: force every server-side consumer in the monolith to use the routed
testnet domains instead of Docker DNS:

```text
AEKO_NETWORK=testnet
AEKO_RPC_URL=https://rpc.aeko.online
AEKO_WS_URL=wss://ws.aeko.online
AEKO_EXPLORER_API_URL=https://api.aeko.online
AEKO_FAUCET_ADDRESS=faucet.aeko.online:9900
```

## Split Coolify resources

Split resources do not share Docker service DNS across resource boundaries.
Configure their adjacent `.env.example` values with reachable domains. For
HTTP/WebSocket services, Coolify should route the domain directly to the
container port, so a cross-instance consumer does **not** require a host
`ports:` mapping.

Raw Faucet and validator transport are exceptions:

- publish Faucet TCP `9900` and firewall it to Validator source addresses;
- publish Validator TCP+UDP `8000-8050`;
- point `gossip.aeko.online` directly at the Validator host;
- do not put gossip or Faucet behind an HTTP-only proxy.

## Local host-published ports

`docker/compose.local.yml` publishes these host defaults for development:

| Host variable | Default host port | Container port | Purpose |
| --- | ---: | ---: | --- |
| `AEKO_GOSSIP_HOST_PORT` | `8001` | `8001` TCP+UDP | local gossip |
| `AEKO_RPC_HOST_PORT` | `8899` | `8899` | validator RPC |
| `AEKO_WS_HOST_PORT` | `8900` | `8900` | validator WebSocket |
| `AEKO_RPC_REPLICA_HOST_PORT` | `8898` | `8899` | optional RPC-node RPC |
| `AEKO_WS_REPLICA_HOST_PORT` | `8896` | `8900` | optional RPC-node WebSocket |
| `AEKO_EXPLORER_API_HOST_PORT` | `8088` | `8088` | Explorer API |
| `AEKO_FRONTEND_HOST_PORT` | `4000` | `4000` | Aeko Scan |
| `AEKO_OPERATIONS_WEB_HOST_PORT` | `3001` | `3001` | Operations Web |

## Security boundaries

- Never expose PostgreSQL `5432` to the public Internet.
- Faucet `9900` is not a public funding API. Restrict it to Validator source
  addresses.
- Browsers use `scan.aeko.online`; they do not need direct knowledge of the
  raw Explorer backend origin.
- Gossip and dynamic validator transport are node networking, not dApp APIs.
- `api.aeko.online` and `registry.aeko.online` must use TLS when routed over
  the public Internet.
- Private keypair files are host-mounted secrets and must never be served by
  Registry, Scan, Explorer API, or Operations Web.

## Related contracts

- `docker/coolify/README.md` for split-resource lifecycle and migration.
- `docs/operations/coolify.md` for Coolify setup.
- `DEPLOYMENT.md` for the complete operator contract.
- `docker/env.public.example` for the shared legacy/local deployment
  environment surface.
