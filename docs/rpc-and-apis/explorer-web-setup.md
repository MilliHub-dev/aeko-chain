# Explorer Web Setup

AEKO Explorer is split into two deployable services:

- `apps/explorer/web`: React/Vite Explorer UI
- `apps/explorer/backend`: Rust/Axum Explorer API and indexer

Production history is not stored in the browser and is not an in-memory simulation. The backend projects finalized validator data into PostgreSQL, while selected live reads such as account lookup and transaction fallback may query validator RPC directly.

## Data path

```text
Explorer Web
    |
    v
Explorer REST API (:8088)
    |                    \
    |                     +--> validator JSON-RPC (live reads)
    v
PostgreSQL
(finalized blocks, transactions, assets, Social projections)
```

## Runtime configuration

Each Explorer API instance belongs to one chain deployment and uses:

```text
AEKO_NETWORK=<mainnet|testnet|devnet|localnet>
AEKO_RPC_URL=<that network's RPC URL>
AEKO_WS_URL=<that network's WebSocket URL>
AEKO_REGISTRY_URL=<that network's registry URL>
```

Aeko Scan is different because one `scan.aeko.online` UI can view multiple
independent chain deployments. Its generic values describe the active/default
network:

```text
AEKO_NETWORK=testnet
AEKO_RPC_URL=https://rpc.aeko.online
AEKO_WS_URL=wss://ws.aeko.online
AEKO_EXPLORER_API_URL=https://api.aeko.online
```

Optional complete `AEKO_MAINNET_*`, `AEKO_TESTNET_*` and
`AEKO_DEVNET_*` RPC/WS/Explorer-API triplets make those remote networks
selectable. Devnet is a real network when configured; it is not an alias for
localnet or testnet.

The Scan container injects a normalized `{network, networks, demo}` runtime
object. Browser indexed reads remain same-origin under
`/api/explorer/{network}`; the Scan server proxies each path to that
network's Explorer API.

## Local Vite development

Copy `apps/explorer/web/.env.example` to `.env.local`. The default local
configuration uses:

```text
AEKO_NETWORK=localnet
AEKO_RPC_URL=http://127.0.0.1:8899
AEKO_WS_URL=ws://127.0.0.1:8900
AEKO_EXPLORER_API_URL=http://127.0.0.1:8088
```

The backend requires PostgreSQL and the same active-network variables:

```bash
EXPLORER_DATABASE_URL=postgres://aeko:change-me@127.0.0.1:5432/aeko_explorer \
AEKO_NETWORK=localnet \
AEKO_RPC_URL=http://127.0.0.1:8899 \
AEKO_WS_URL=ws://127.0.0.1:8900 \
AEKO_EXPLORER_BIND=127.0.0.1:8088 \
cargo run -p aeko-explorer-backend
```

Useful indexing controls include `AEKO_EXPLORER_START_SLOT`,
`AEKO_EXPLORER_MAX_BATCH_SIZE`, and
`AEKO_EXPLORER_SYNC_INTERVAL_SECS`.

## Run Explorer Web locally

```bash
npm --prefix apps/explorer/web ci
npm --prefix apps/explorer/web run dev
```

Key Explorer routes include:

- `/explorer`
- `/explorer/block/:height`
- `/explorer/tx/:hash`
- `/explorer/account/:address`
- `/explorer/creator/:address`
- `/explorer/post/:postId`
- `/explorer/nft/:tokenId`
- `/explorer/token/:mint`
- `/explorer/collection/:collectionId`

## Source-of-truth behavior

- finalized blocks and transaction history come from PostgreSQL projections;
- exact live account reads are verified against validator RPC;
- current token/NFT state is refreshed from canonical program accounts and persisted in PostgreSQL;
- SocialFi state is projected from canonical registry-bound state accounts;
- Explorer surfaces fail honestly when a required source is unavailable instead of substituting fixtures or dummy records.
