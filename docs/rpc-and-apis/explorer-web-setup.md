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

## Production runtime configuration

Production images are deployment-neutral. `docker/explorer-ui-entrypoint.sh` reads these required variables when the container starts and writes `/runtime-config.js`:

```bash
AEKO_PUBLIC_RPC_URL=
AEKO_PUBLIC_WS_URL=
AEKO_PUBLIC_EXPLORER_API_URL=
AEKO_PUBLIC_EXPLORER_URL=
AEKO_PUBLIC_FUNDING_URL=
```

The API URL must route to `explorer-api:8088`. The UI URL must route to `explorer-ui:4000`; the entrypoint rejects an API/UI endpoint collision.

Optional mainnet and AEKO-721 demo runtime values live in the same canonical deployment template: `docker/env.public.example`.

## Local Vite development

For local development, `apps/explorer/web/.env.example` contains only the optional atomic loopback override trio:

```bash
VITE_AEKO_LOCAL_RPC=http://127.0.0.1:8899
VITE_AEKO_LOCAL_WS=ws://127.0.0.1:8900
VITE_AEKO_LOCAL_EXPLORER_API=http://127.0.0.1:8088
```

All three values must be supplied together and must remain loopback endpoints. They are optional because the same loopback ports are the local defaults. Remote previews and production both use the canonical `AEKO_*` runtime configuration; there is no second remote Vite environment family.

## Boot the Explorer backend locally

The backend requires PostgreSQL and validator RPC:

```bash
EXPLORER_DATABASE_URL=postgres://aeko:change-me@127.0.0.1:5432/aeko_explorer \
AEKO_EXPLORER_RPC=http://127.0.0.1:8899 \
AEKO_EXPLORER_NETWORK=localnet \
AEKO_EXPLORER_BIND=127.0.0.1:8088 \
cargo run -p aeko-explorer-backend
```

Useful indexing controls include `AEKO_EXPLORER_START_SLOT`, `AEKO_EXPLORER_MAX_BATCH_SIZE`, and `AEKO_EXPLORER_SYNC_INTERVAL_SECS`. See `docker/env.public.example` for the deployment-wide Explorer backend settings.

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
