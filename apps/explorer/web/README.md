# AEKO Explorer Web

The Explorer UI is a React/Vite client for the AEKO Explorer API. Production Explorer pages do not invent chain state and do not use browser-side fixtures as a substitute for indexed data.

## Data-source contract

Production Explorer reads follow this path:

```text
Explorer React pages
        |
        v
Explorer REST API
        |
        +-- live account / chain position -> validator JSON-RPC
        |
        +-- blocks / transactions / assets / Social history -> PostgreSQL projections
        |
        v
AEKO validator / finalized chain
```

`src/utils/explorerApi.js` is the production Explorer read boundary. Testnet defaults to `https://api.aeko.online` and can be overridden with `VITE_AEKO_TESTNET_EXPLORER_API`.

The additive `/overview` endpoint combines live validator position with real PostgreSQL row totals and projection cursors. During a rolling upgrade only, an older backend that explicitly returns 404/405/501 for `/overview` may fall back to the configured public RPC for the live slot. Backend outages are not silently bypassed.

## Direct RPC usage

Direct JSON-RPC from the browser is intentional only for consumer-style operations that cannot be delegated to the read-only Explorer backend, including:

- wallet/network test tools;
- airdrops on development/test networks;
- signing/submitting transactions;
- explicit Social/NFT end-to-end test consoles;
- the temporary `/overview` compatibility fallback described above.

Block, transaction, account, creator, token, NFT, collection, post and search pages use the Explorer API first because they need durable indexed history and aggregation.

`src/data/nftDemoExamples.js` belongs only to the explicitly labeled AEKO-721 demo workflow. It is not a data source for `/explorer`.

## Validation

```bash
npm ci
npm test
npm run lint
npm run build
```

The repository image workflow runs these checks before building the `explorer-ui` image.
