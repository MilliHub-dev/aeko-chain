# AEKO Operations Web

`apps/admin` is the historical source directory for one deployable **Operations Web** service. The same Next.js runtime serves:

- **Testnet Funding Portal**: public funding requests that wait for operator approval.
- **Admin Console**: authenticated operator monitoring and funding controls.

The Rust **Faucet Daemon** is a separate private TCP signer, normally reachable as `faucet:9900` on the Compose network. It has no public web route.

## Runtime configuration

Public ingress is deployment-owned:

- `AEKO_PUBLIC_FUNDING_URL`
- `AEKO_PUBLIC_ADMIN_URL`
- `AEKO_PUBLIC_EXPLORER_URL`
- `FUNDING_ALLOWED_ORIGINS`

Internal dependencies use `AEKO_RPC_URL` and `AEKO_EXPLORER_URL`. `AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN` is server-side only and authorizes settings mutations from Operations Web to Explorer. Compose defaults the internal service URLs to same-network service names.

## Routes

| Path | Audience | Purpose |
| --- | --- | --- |
| `/funding` | public | Submit a policy-sized testnet funding request for operator approval |
| `POST /api/funding/request` | public / trusted backend | Public callers create a pending request; trusted backends retain the immediate policy grant path |
| `POST /api/funding/airdrop` | Explorer Test Console | Submit a constrained direct developer airdrop with a caller-selected amount |
| `GET /api/funding/policy` | public | Funding policy/status |
| `/login` | operator | Admin sign-in |
| `/funding-grants` | operator | Pending request approvals, funding policy, manual grants and history |
| `/`, `/blocks`, `/transactions`, `/tokens`, `/nfts`, `/marketplace` | operator | Chain and asset monitoring |
| `/social` | operator | Indexed AEKO Social activity plus canonical SocialFi registry/live domain status |
| `/protocol` | operator | Protocol feature activation, native programs, canonical state accounts and registry identity |

There is no public `/faucet` route. “Faucet” refers only to the private signer daemon.

## Trust boundaries

- `FUNDING_CLIENT_API_KEY`: optional trusted backend key; bypasses only HTTP per-IP throttling.
- `FUNDING_GATEWAY_KEY`: server secret authorizing protected low-level `requestAirdrop`.
- `FUNDING_MAX_CONSOLE_AIRDROP_AEKO`: Operations Web ceiling for direct Test Console airdrops.
- `AEKO_FAUCET_PER_REQUEST_CAP`: private Faucet Daemon hard ceiling.

## Local development

```bash
npm ci
cp .env.local.example .env.local
npm run dev
npx tsc --noEmit && npm run build
```
