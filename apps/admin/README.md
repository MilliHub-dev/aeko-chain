# AEKO Operations Web

`apps/admin` builds the authenticated Operations Web / Admin console served by
`admin.aeko.online` on container port `3001`.

The current deployment has **one Admin role**. Public testnet funding is not a
second Operations Web deployment and there is no separate funding origin/runtime.
Funding policy, approval requests, manual grants, and constrained Test Console
airdrops are owned by the Explorer API funding module. Public Scan/browser
funding calls the selected Explorer API directly under its explicit CORS
allowlist. Privileged operator actions remain behind the authenticated
Operations Web BFF and its server-only Explorer credential.

## Network contract

One Operations Web deployment administers one blockchain environment. In split
production deployments, give Operations Web private or DNS-only upstreams:

```text
AEKO_NETWORK=testnet
AEKO_RPC_URL=https://<private-or-dns-only-validator-rpc-origin>
AEKO_EXPLORER_API_URL=https://<private-or-dns-only-explorer-api-origin>
AEKO_ADMIN_EXPLORER_TIMEOUT_MS=45000
```

The split resource uses the same canonical `AEKO_RPC_URL` and
`AEKO_EXPLORER_API_URL` runtime names directly. Local development may use
loopback URLs, while all-in-one Compose uses Docker service names. Operations must not hairpin privileged traffic
through the public Cloudflare/WAF edge.

Admin does not load endpoint matrices for other networks. Cross-network
selection belongs to Aeko Scan.

## Trust boundaries

- `AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN`: server-side Operations Web -> Explorer
  API control-plane credential. It must never be exposed to browser runtime.
- `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`: Admin authentication/session
  secrets.
- `AEKO_RPC_URL`: server-side RPC used for operator chain reads.
- `AEKO_EXPLORER_API_URL`: server-side Explorer API used for indexed reads and
  authenticated control-plane operations.
- The Faucet Daemon is separate raw TCP infrastructure on port `9900`; Admin
  and browsers do not connect to it directly.

## Operator routes

| Path | Audience | Purpose |
| --- | --- | --- |
| `/login` | operator | Admin sign-in |
| `/funding-grants` | operator | Funding approval queue, policy, manual grants, and history |
| `/`, `/blocks`, `/transactions`, `/tokens`, `/nfts`, `/marketplace` | operator | Chain and asset monitoring |
| `/social` | operator | Indexed Social activity and canonical live state |
| `/protocol` | operator | Protocol features, programs, and canonical state |
| `/settings` | operator | Durable Explorer/application settings |

Public funding routes live on Explorer API, not on the Admin origin.

## Local development

```bash
npm ci
cp .env.local.example .env.local
npm run dev
npx tsc --noEmit
npm run build
```

The local server listens on `http://localhost:3001`.

For the complete domain/port map, see
[`docs/operations/network-ports-and-domains.md`](../../docs/operations/network-ports-and-domains.md).
