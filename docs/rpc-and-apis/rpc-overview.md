# RPC Overview

AEKO uses **JSON-RPC 2.0** for direct chain interaction and a separate WebSocket endpoint for PubSub subscriptions.

## Canonical deployed public testnet

| Interface | Endpoint |
| --- | --- |
| JSON-RPC | `https://rpc.aeko.online` |
| WebSocket PubSub | `wss://ws.aeko.online` |

Indexed Explorer data is exposed through the public Explorer API, for example `https://api.aeko.online/...`. Aeko Scan calls this API directly from the browser; `explorer-api:8088` remains only the private service address used by server-side components such as Operations Web.

Funding on every network is owned by that network's Explorer API. Browser clients use the selected network's public Explorer API `/funding/*` routes directly. Operations Web uses the private Explorer origin for Admin-only operations. Public funding requests enter the Explorer-backed approval queue, while instant airdrops use the direct `requestAirdrop` path or the separately constrained `/funding/airdrop` route, and approval-gated grants settle through `requestGrant`. The private Faucet Daemon remains the low-level TCP signer used by the Validator funding path.

## Other networks

No mainnet or separate devnet public endpoint is defined by the current repository deployment contract. Configure non-testnet endpoints explicitly rather than relying on old placeholder domains.

## Rate limits

Rate limits are deployment policy, not a fixed protocol guarantee. Clients should handle HTTP 429 responses and retry conservatively rather than depending on an undocumented numeric quota.
