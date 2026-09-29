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

### Registry discovery

The bootstrap registry and the product-facing registry API are different
surfaces:

- `https://registry.aeko.online/` is a read-only bootstrap service. Its root
  returns a small non-secret discovery manifest; the canonical documents are
  `/social-registry.env` and `/protocol-registry.env`. Unknown paths return
  `404` by design.
- Aeko Scan, Operations Web, and application clients should use the selected
  network's Explorer API instead: `GET /registry`, `GET /registry/social`,
  and `GET /registry/protocol`. On public Testnet those are available through
  `https://scan.aeko.online/api/explorer/testnet/registry...`.
- A local Explorer backend exposes the same API contract at its configured
  Explorer origin (normally `http://127.0.0.1:8088`). A `404` from an
  arbitrary raw bootstrap-registry path is therefore not a signal to bypass the
  Explorer API or guess a key-file URL.

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
visible environment terminology. Each network exposes the funding workflow
served by its own Explorer API deployment: Scan submits the request and
authenticated Operations Admin makes the grant decision.
