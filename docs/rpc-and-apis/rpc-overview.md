# RPC Overview

AEKO uses **JSON-RPC 2.0** for direct chain interaction and a separate WebSocket endpoint for PubSub subscriptions.

## Canonical deployed public testnet

| Interface | Endpoint |
| --- | --- |
| JSON-RPC | `https://rpc.aeko.online` |
| WebSocket PubSub | `wss://ws.aeko.online` |

Indexed Explorer data is exposed to the browser only through the Explorer UI origin, for example `https://scan.aeko.online/api/explorer/testnet/...`. The raw `explorer-api:8088` service is private deployment infrastructure and is not a public developer endpoint.

The Testnet Funding API at `https://fund.aeko.online/api/funding` is the Operations Web funding role (same `aeko-operations-web` image as Admin, separate deployment; not a separate app repo). Public funding requests enter an operator approval queue; an approved request is released through a server-authorized low-level `requestAirdrop` call against the private Faucet Daemon. Funding policy state is off-chain queue accounting only — chain settlement is `requestAirdrop`/faucet and supply accounting follows `tokenomics.md` (500B baseline plus governed floor inflation), not the funding ledger. The Scan Test Console (`/network-tools`) uses the separate constrained `POST /api/funding/airdrop` route with a caller-selected amount so it does not wait for human approval. Target direction is Scan same-origin funding under `scan.aeko.online/api/explorer/testnet/funding/*` owned by the Scan backend; `fund.aeko.online` remains only as the current funding origin until that move lands.

## Other networks

No mainnet or separate devnet public endpoint is defined by the current repository deployment contract. Configure non-testnet endpoints explicitly rather than relying on old placeholder domains.

## Rate limits

Rate limits are deployment policy, not a fixed protocol guarantee. Clients should handle HTTP 429 responses and retry conservatively rather than depending on an undocumented numeric quota.
