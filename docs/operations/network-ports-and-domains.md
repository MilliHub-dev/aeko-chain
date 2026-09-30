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
reached directly by Aeko Scan browser clients at
`https://api.aeko.online/funding/*` under an explicit CORS allowlist. The
private Faucet on `9900` remains the low-level signer used by the Validator
funding path.

The read-only registry exposes:

- `/` — a small JSON discovery manifest naming the safe public registry paths;
- `/healthz` — health probe;
- `/social-registry.env` — canonical Social bootstrap registry;
- `/protocol-registry.env` — canonical Protocol bootstrap registry.

Unknown paths still return 404. The registry never mounts or serves
`/data/aeko/keys`. A split Explorer API consumes the two registry documents
through its active network's `AEKO_REGISTRY_URL`; co-located/local deployments
may instead use mounted registry files. Explorer also exposes `GET /registry`
as a safe discovery response for its own `/registry/social` and
`/registry/protocol` API routes, so local/API consumers do not need to guess
registry subpaths.

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
active/default network. Optional complete alternate triplets use
`AEKO_<NETWORK>_RPC_URL`, `AEKO_<NETWORK>_WS_URL`, and
`AEKO_<NETWORK>_EXPLORER_API_URL`. Those public Explorer API URLs are
published in Scan runtime configuration and called directly by the browser.

The standard public selector exposes **Mainnet** and **Testnet** only. Devnet
and Localnet remain valid independently deployed/operator development
environments and can be the active environment, but they are not presented as
public network choices.

## Single-network co-located/local Compose defaults and overrides

Local development keeps the generic runtime endpoint variables directly
overridable. Production all-in-one Dokploy/Coolify stacks separate public Scan
endpoints from backend service routing so server traffic cannot accidentally
hairpin through Cloudflare/WAF.

| Consumer | Runtime target inside the container | Production deployment input |
| --- | --- | --- |
| Social bootstrap -> Validator RPC | `AEKO_RPC_URL` | `AEKO_RPC_URL` on Bootstrap resource |
| Protocol bootstrap -> Validator RPC | `AEKO_RPC_URL` | `AEKO_RPC_URL` on Bootstrap resource |
| Explorer API -> Validator RPC | `AEKO_RPC_URL` | `AEKO_RPC_URL` on Explorer resource |
| Explorer API -> Validator WS | `AEKO_WS_URL` | `AEKO_WS_URL` on Explorer resource |
| Operations Web -> Validator RPC | `AEKO_RPC_URL` | `AEKO_RPC_URL` on Operations resource |
| Operations Web -> Explorer API | `AEKO_EXPLORER_API_URL` | `AEKO_EXPLORER_API_URL` on Operations resource |
| Validator -> Faucet | `AEKO_FAUCET_ADDRESS` | `AEKO_FAUCET_ADDRESS` on Validator resource |
| Scan browser -> Validator RPC/WS | public runtime config | `AEKO_RPC_URL`, `AEKO_WS_URL` |
| Scan browser -> Explorer reads/funding | public Explorer API | `AEKO_EXPLORER_API_URL` plus Explorer `AEKO_EXPLORER_CORS_ORIGINS` |

For an all-in-one production stack Compose wires Docker service DNS directly
(`validator:8899`, `validator:8900`, `explorer-api:8088`, `faucet:9900`).
Those backend hops are intentionally not inherited from public browser endpoint
variables. Do not replace them with Cloudflare-proxied public endpoints merely
because the public hostname is reachable from a browser.

## Split Coolify resources

Split resources do not share Docker service DNS across resource boundaries.
Configure each adjacent `.env.example` with a reachable private URL or a
DNS-only Coolify origin. The HTTP/WS origin may still be routed by Coolify to
the service's exposed container port; the important requirement is that
server-to-server funding traffic bypasses public bot/WAF handling. A raw
cross-host `host:8899`, `:8900`, `:8088`, or `:8089` URL works only when
the operator explicitly publishes that port and restricts it appropriately.

Raw Faucet and validator transport are exceptions:

- publish Faucet TCP `9900` and firewall it to Validator source addresses;
- set `AEKO_FAUCET_ADDRESS=<private-or-dns-only-faucet-host>:9900` on the Validator resource;
- do not attach HTTP/WAF routing or HTTP health probes to Faucet `9900`;
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
- Browsers load the SPA from `scan.aeko.online` and call the selected public
  Explorer API (for example `api.aeko.online`) directly. They never receive
  the private server-to-server Explorer origin used by Operations Web.
- Edge/WAF rules on the public Explorer API must not replace REST/funding
  responses with interactive HTML challenges. Keep API failures JSON and keep
  the explicit Explorer CORS allowlist aligned with the approved Scan origin.
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
