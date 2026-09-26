# AEKO Network Environments

## Public Testnet

The repository currently defines and deploys one canonical public network: **AEKO Public Testnet**.

| Surface | Endpoint |
| --- | --- |
| JSON-RPC | `https://rpc.aeko.online` |
| WebSocket PubSub | `wss://ws.aeko.online` |
| Explorer UI + indexed reads | `https://scan.aeko.online` |
| Testnet funding | `https://scan.aeko.online/api/explorer/testnet/funding/*` |
| Validator gossip | `gossip.aeko.online:8001` |

Testnet AEKO has no asserted monetary value. Public funding is policy-controlled through the Funding Portal. The Faucet Daemon on TCP `9900` is private infrastructure.

## Mainnet

This repository does **not** currently define a canonical public AEKO mainnet endpoint or claim a live mainnet deployment. Applications must not invent or reuse an undeclared mainnet endpoint.

When a mainnet is deployed, configure its RPC, WebSocket, Explorer API and Explorer UI explicitly.

## Devnet

This repository does **not** currently define a separate public devnet endpoint. Local development uses loopback endpoints; remote development should target the public testnet unless another network is explicitly provisioned.
