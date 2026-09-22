# AEKO Operations Web

One Next.js image serves two distinct web roles:

- **Testnet Funding Portal** — `fund.aeko.online`, public, policy-controlled test AEKO grants.
- **Admin Console** — `admin.aeko.online`, operator-only monitoring and funding controls.

The **Faucet Daemon** is not this web app. It is the private Rust TCP service at `faucet:9900`. The Funding Portal calls the validator internally; the validator talks to the Faucet Daemon.

## Canonical routes

| Path | Audience | Purpose |
| --- | --- | --- |
| `/funding` | public | Request a policy-sized testnet funding grant |
| `POST /api/funding/request` | public / trusted backend | Create one funding grant; trusted backends may use `x-funding-key` |
| `GET /api/funding/policy` | public | Funding amount, cooldown, daily budget and remaining budget |
| `/login` | operator | Admin sign-in |
| `/funding-grants` | operator | Pause/resume funding, edit policy, manual grants, grant history |
| `/`, `/blocks`, `/transactions`, `/tokens`, `/nfts`, `/social`, `/marketplace` | operator | Chain monitoring |

Legacy `/faucet`, `/airdrops` and `/api/faucet/*` routes exist only as compatibility shims.

## Trust boundaries

- `FUNDING_PUBLIC_HOST`: public web hostname, normally `fund.aeko.online`.
- `FUNDING_CLIENT_API_KEY`: optional trusted application-backend key. It only bypasses the HTTP per-IP throttle.
- `FUNDING_GATEWAY_KEY`: required on the public deployment. It authorizes the server-side Funding Gateway to invoke the validator's low-level `requestAirdrop` method.
- `AEKO_FAUCET_PER_REQUEST_CAP`: Faucet Daemon hard ceiling. This belongs to the private daemon, not the public web policy.

Public users do **not** connect to TCP port 9900 and should not be given a Faucet Daemon URL.

## Local development

```bash
npm ci
cp .env.local.example .env.local
npm run dev
npx tsc --noEmit && npm run build
```
