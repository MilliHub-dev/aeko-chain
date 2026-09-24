# RPC Overview

AEKO uses **JSON-RPC 2.0** for direct chain interaction and a separate WebSocket endpoint for PubSub subscriptions.

## Canonical deployed public testnet

| Interface | Endpoint |
| --- | --- |
| JSON-RPC | `https://rpc.aeko.online` |
| WebSocket PubSub | `wss://ws.aeko.online` |

The Explorer REST API at `https://api.aeko.online` is **not** the JSON-RPC endpoint. It serves indexed Explorer data.

The Testnet Funding API at `https://fund.aeko.online/api/funding` is also a separate HTTP service. Public funding requests enter an operator approval queue; an approved request is released through a server-authorized low-level `requestAirdrop` call. Explorer's developer Test Console uses a separate constrained airdrop route with a caller-selected amount so it does not wait for human approval.

## Other networks

No mainnet or separate devnet public endpoint is defined by the current repository deployment contract. Configure non-testnet endpoints explicitly rather than relying on legacy placeholder domains.

## Rate limits

Rate limits are deployment policy, not a fixed protocol guarantee. Clients should handle HTTP 429 responses and retry conservatively rather than depending on an undocumented numeric quota.
