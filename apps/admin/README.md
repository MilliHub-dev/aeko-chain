# AEKO Operations Web

`apps/admin` builds one Next.js image (`aeko-operations-web`) that is deployed as two isolated service
roles. They share source code but do not share public routes or runtime secrets.
There is no separate `apps/funding` repo: "funding" is a deployment role of this image, currently served
from the `fund.aeko.online` origin pending the approved move to Scan same-origin funding
(`scan.aeko.online/api/explorer/testnet/funding/*` owned by the Scan backend).

## Service roles

### Funding role (current origin `fund.aeko.online`)

Set `AEKO_OPERATIONS_ROLE=funding`.

The funding role is the only public funding service. It owns:

- `/funding`;
- `GET /api/funding/policy`;
- `POST /api/funding/request` for the operator-approval queue;
- `POST /api/funding/airdrop` for the separately constrained Test Console flow;
- persistent funding state;
- `FUNDING_GATEWAY_KEY`, which authorizes low-level `requestAirdrop`.

Its private `/api/internal/funding/*` routes are authenticated with
`FUNDING_ADMIN_API_KEY` and are intended only for same-network calls from the
Admin service. Requests for Admin pages or Admin APIs return 404 on the public
funding origin. Funding queue state here is off-chain policy accounting only;
chain settlement is server-side `requestAirdrop`/private faucet, and supply
accounting follows `tokenomics.md`, not this ledger.

### Admin Console

Set `AEKO_OPERATIONS_ROLE=admin`.

The Admin service owns authenticated operator pages and APIs. It does not mount
funding state and does not receive `FUNDING_GATEWAY_KEY`. Funding controls belong behind the active environment's Explorer API
funding-admin boundary; Admin does not need a second network-specific funding
endpoint set.

Admin belongs to one active chain environment. It uses `AEKO_NETWORK`,
`AEKO_RPC_URL`, and server-side `AEKO_EXPLORER_API_URL` for that environment.
It never loads endpoint sets for other networks; cross-network selection belongs
to Aeko Scan. Browser clients never receive the Explorer settings mutation token.

## Trust boundaries

- `FUNDING_GATEWAY_KEY`: funding role only; authorizes protected low-level airdrops.
- `FUNDING_ADMIN_API_KEY`: shared only between the private Admin service and funding role.
- `AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN`: Admin service only; authorizes Explorer settings mutations.
- `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`: Admin service only.
- `FUNDING_ALLOWED_ORIGINS`: funding role CORS allowlist for the Scan UI (`scan.aeko.online`).
- `AEKO_FAUCET_PER_REQUEST_CAP`: private Faucet Daemon hard ceiling.

The Rust Faucet Daemon is raw TCP infrastructure, not an HTTP route. In the
split testnet it is addressed as `faucet.aeko.online:9900`; access to TCP
9900 should be restricted to Validator source addresses.

## Operator routes

| Path | Audience | Purpose |
| --- | --- | --- |
| `/login` | operator | Admin sign-in |
| `/funding-grants` | operator | Approval queue, policy, manual grants and history |
| `/`, `/blocks`, `/transactions`, `/tokens`, `/nfts`, `/marketplace` | operator | Chain and asset monitoring |
| `/social` | operator | Indexed Social activity and canonical live state |
| `/protocol` | operator | Protocol features, programs and canonical state |

## Public funding routes

| Path | Audience | Purpose |
| --- | --- | --- |
| `/funding` | public | Submit a policy-sized request for operator approval |
| `GET /api/funding/policy` | public | Read funding policy/status |
| `POST /api/funding/request` | public | Create a pending request |
| `POST /api/funding/airdrop` | Explorer Test Console | Constrained developer-only direct airdrop |

## Local development

Compose runs the roles separately:

- Admin: `http://localhost:3001`
- Funding role: `http://localhost:3002`

For direct source work:

```bash
npm ci
cp .env.local.example .env.local
npm run dev
npx tsc --noEmit && npm run build
```

A single direct `npm run dev` process uses the role selected by
`AEKO_OPERATIONS_ROLE`. Use Compose when both roles are required together.
