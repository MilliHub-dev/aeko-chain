# Explorer Web Setup

This guide connects the new explorer frontend pages in `web/` to the explorer backend in `explorer-backend/`.

## What Exists Now

- backend HTTP server:
  - [`explorer-backend/src/server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/server.rs)
- backend boot example:
  - [`explorer-backend/examples/api_server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/examples/api_server.rs)
- frontend explorer pages:
  - [`web/src/pages/Explorer.jsx`](/Users/ok/Documents/projects/aeko-chain/web/src/pages/Explorer.jsx)
  - [`web/src/pages/BlockDetails.jsx`](/Users/ok/Documents/projects/aeko-chain/web/src/pages/BlockDetails.jsx)
  - [`web/src/pages/TransactionDetails.jsx`](/Users/ok/Documents/projects/aeko-chain/web/src/pages/TransactionDetails.jsx)
  - [`web/src/pages/ExplorerAccount.jsx`](/Users/ok/Documents/projects/aeko-chain/web/src/pages/ExplorerAccount.jsx)
  - [`web/src/pages/ExplorerCreator.jsx`](/Users/ok/Documents/projects/aeko-chain/web/src/pages/ExplorerCreator.jsx)
  - [`web/src/pages/ExplorerPost.jsx`](/Users/ok/Documents/projects/aeko-chain/web/src/pages/ExplorerPost.jsx)
  - [`web/src/pages/ExplorerNft.jsx`](/Users/ok/Documents/projects/aeko-chain/web/src/pages/ExplorerNft.jsx)

## Required Web Env Vars

Add these to your local web env file:

```bash
VITE_AEKO_TESTNET_EXPLORER_API=http://127.0.0.1:8088
VITE_AEKO_MAINNET_EXPLORER_API=
```

The example values are also present in:

- [`web/.env.example`](/Users/ok/Documents/projects/aeko-chain/web/.env.example)

## Boot The Explorer Backend

From the repo root:

```bash
AEKO_EXPLORER_RPC=https://api.testnet.aeko.chain \
AEKO_EXPLORER_NETWORK=testnet \
AEKO_EXPLORER_BIND=127.0.0.1:8088 \
cargo run -p aeko-explorer-backend --example api_server
```

Optional:

- set `AEKO_EXPLORER_START_SLOT` if you want to start from a non-zero slot

## Run The Web App

From the repo root:

```bash
npm --prefix web run dev
```

Then open:

- `/explorer`
- `/explorer/block/:height`
- `/explorer/tx/:hash`
- `/explorer/account/:address`
- `/explorer/creator/:address`
- `/explorer/post/:postId`
- `/explorer/nft/:tokenId`

## Current Behavior

- if `VITE_AEKO_*_EXPLORER_API` is set, the explorer pages use live backend data
- if it is not set, the pages show a configuration message instead of fake data

## Current Limitations

- the backend is still first-pass and in-memory
- AEKO-20 data is currently modeled as account-balance snapshots rather than full historical transfer decoding
- some richer explorer views still need dedicated backend endpoints and durable storage
