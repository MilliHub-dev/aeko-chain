# RPC Overview

AEKO uses **JSON-RPC 2.0** for direct chain interaction and a separate WebSocket endpoint for PubSub subscriptions.

## Canonical deployed public testnet

| Interface | Endpoint |
| --- | --- |
| JSON-RPC | `https://rpc.aeko.online` |
| WebSocket PubSub | `wss://ws.aeko.online` |

Indexed Explorer data is available from the public Explorer API, `https://api.aeko.online`, while the human UI is served separately from `https://scan.aeko.online`. Aeko Scan calls the Explorer API directly from the browser under the API's explicit CORS allowlist. The container-local `explorer-api:8088` name remains a same-stack service address, not a browser endpoint.

Funding on every configured network is owned by that network's Explorer API. On public Testnet the browser uses `https://api.aeko.online/funding/*` directly. Public funding requests enter the Explorer-backed approval queue, instant developer airdrops use the separately constrained `/funding/airdrop` route, and approval-gated grants settle through `requestGrant`. The private Faucet Daemon remains the low-level raw-TCP signer used by the Validator funding path.

## Other networks

No mainnet or separate devnet public endpoint is defined by the current repository deployment contract. Configure non-testnet endpoints explicitly rather than relying on old placeholder domains.

## Rate limits

Rate limits are deployment policy, not a fixed protocol guarantee. Clients should handle HTTP 429 responses and retry conservatively rather than depending on an undocumented numeric quota.
