# Validator Guide

This guide describes the **AEKO Public Testnet** network boundary. The current repository does not define a canonical public mainnet.

## Public Testnet Network Surfaces

| Purpose | Endpoint |
| --- | --- |
| Validator gossip / peer discovery | `gossip.aeko.online:8001` |
| Public JSON-RPC | `https://rpc.aeko.online` |
| WebSocket PubSub | `wss://ws.aeko.online` |
| Explorer | `https://scan.aeko.online` |

`gossip.aeko.online` is raw validator networking, not an HTTP/Explorer hostname.

## Software

The lightweight public CLI installer installs **only** `aeko` and `aeko-keygen`:

```bash
curl -fsSL https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.sh | sh
```

It does **not** install `aeko-validator`, `aeko-gossip`, or `aeko-sys-tuner`.

Validator operators should use a validated validator release/image produced from this repository or build the required validator binaries from the repository source. Do not assume the CLI-only installer provisions a validator node.

## Identity

Generate validator key material with the release-matched `aeko-keygen`:

```bash
aeko-keygen new -o validator-keypair.json
```

A voting validator also requires the chain-specific vote/stake provisioning expected by the active network. Creating a local keypair alone does not register a new voting validator on the public testnet.

## Network Reachability

The current public deployment publishes validator TCP+UDP transport ports `8000-8050`; gossip begins on `8001`. External validator operation requires the advertised addresses, firewall rules, voting/stake state and release compatibility to be correct.

For the deployed single-validator stack, see `DEPLOYMENT.md` and `docker/compose.coolify.yml`. Those files are the operational source of truth for the currently deployed node.
