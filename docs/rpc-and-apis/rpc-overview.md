# RPC Overview

AEKO uses **JSON-RPC 2.0** for direct chain interaction and a separate WebSocket endpoint for PubSub subscriptions.

## Canonical deployed public testnet

| Interface | Endpoint |
| --- | --- |
| JSON-RPC | `https://rpc.aeko.online` |
| WebSocket PubSub | `wss://ws.aeko.online` |

Indexed Explorer data is exposed to the browser only through the Explorer UI origin, for example `https://scan.aeko.online/api/explorer/testnet/...`. The raw `explorer-api:8088` service is private deployment infrastructure and is not a public developer endpoint.

Testnet funding is owned by the Explorer API. Browser clients use the Aeko Scan same-origin path `https://scan.aeko.online/api/explorer/testnet/funding/*`; the direct server-side Explorer origin is `https://api.aeko.online`. Public funding requests enter the Explorer-backed approval queue, while the Scan Test Console uses the separately constrained `/funding/airdrop` route. The private Faucet Daemon remains the low-level TCP signer used by the Validator funding path.

## Other networks

No mainnet or separate devnet public endpoint is defined by the current repository deployment contract. Configure non-testnet endpoints explicitly rather than relying on old placeholder domains.

## Rate limits

Rate limits are deployment policy, not a fixed protocol guarantee. Clients should handle HTTP 429 responses and retry conservatively rather than depending on an undocumented numeric quota.
