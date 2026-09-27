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

Testnet AEKO has no asserted monetary value. Public funding requests use Aeko Scan's same-origin Explorer funding API and require authenticated Operations Admin approval before settlement. The Faucet Daemon on TCP `9900` is low-level infrastructure used by the Validator funding path, not a browser funding API.

## Mainnet

This repository does **not** currently define a canonical public AEKO mainnet
endpoint or claim a live mainnet deployment. Applications must not invent or
reuse an undeclared mainnet endpoint.

Mainnet protocol bootstrap is intentionally fail-closed today. The signed-off
500B AEKO economic target cannot fit the current native `u64` balance model at
nine-decimal precision, and the repository also does not yet implement the
complete two-house governance/reserve-spend executor. Those are explicit
pre-mainnet protocol blockers, not reasons to reuse testnet Faucet funding.

When those protocol blockers are resolved and a mainnet is deliberately
provisioned, configure its RPC, WebSocket, Explorer API and Explorer UI
explicitly as that network's independent deployment.

## Devnet

This repository does **not** currently define a separate public devnet endpoint. Local development uses loopback endpoints; remote development should target the public testnet unless another network is explicitly provisioned.


## Aeko Scan network selection

The normal public Aeko Scan selector exposes **Mainnet** and **Testnet**. It
does not advertise Devnet or Localnet as public networks. Devnet and Localnet
remain supported as independently configured development environments and may
be used by dedicated developer/operator deployments.

Changing the selected public network changes the Explorer/API target and the
visible environment terminology. Mainnet hides test-only funding and console
capabilities; Testnet exposes the policy-controlled request workflow where
Scan submits the request and authenticated Operations Admin makes the grant
decision.
