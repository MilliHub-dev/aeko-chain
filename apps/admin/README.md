# AEKO Admin

Operator console for the AEKO chain plus the **public testnet faucet**. Deployed as `surdma/aeko-admin` at `chain.aeko.online` (see `docker/compose.coolify.yml`).

## What it serves

| Path | Who | Purpose |
| --- | --- | --- |
| `/faucet` | anyone | Request test AEKO for a wallet address under the current policy |
| `POST /api/faucet/request` | anyone / Aeko backend | `{ address }` → one grant. The backend sends `x-faucet-key: FAUCET_API_KEY` and skips the per-IP throttle |
| `GET /api/faucet/policy` | anyone | Amount, cooldown, daily budget and remaining budget |
| `/login` | operator | Password sign-in (`ADMIN_PASSWORD`), 12-hour signed cookie |
| `/`, `/blocks`, `/transactions`, `/tokens`, `/nfts`, `/social`, `/marketplace`, `/accounts/:address` | operator | Chain monitoring through the read-only RPC/Explorer relays |
| `/airdrops` | operator | Pause/resume the faucet, edit the policy, manual grants, grant history |

## Faucet policy

Per-wallet cooldown, daily budget and the public amount are enforced here and persisted in `FAUCET_STATE_DIR/faucet-state.json` (a volume in production). The chain faucet binary adds a hard per-request ceiling (`--per-request-cap`). The validator's public `requestAirdrop` RPC still exists for the Explorer test console, so the per-wallet rules apply to this faucet and to the Aeko app, not to someone calling the RPC directly — acceptable for a testnet, and the per-request cap bounds it.

## Configuration

See `.env.local.example`. `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` are required in production; in development the password falls back to `admin`.

## Develop

```bash
npm ci
cp .env.local.example .env.local   # point AEKO_RPC_URL / AEKO_EXPLORER_URL at a node
npm run dev                         # http://localhost:3001
npx tsc --noEmit && npm run build
```
