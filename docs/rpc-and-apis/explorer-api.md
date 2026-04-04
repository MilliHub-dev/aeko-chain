# AEKO Explorer API

This document defines the backend API surface for the AEKO Explorer.

The explorer backend is indexer-backed. Unlike the raw chain RPC, these endpoints may return enriched and historical views derived from persisted chain data.

Current first-pass implementation status in repo:

- a runnable HTTP server exists in [`explorer-backend/src/server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/src/server.rs)
- a local boot example exists in [`explorer-backend/examples/api_server.rs`](/Users/ok/Documents/projects/aeko-chain/explorer-backend/examples/api_server.rs)
- frontend wiring and env setup are documented in [`docs/rpc-and-apis/explorer-web-setup.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/explorer-web-setup.md)
- the first live routes currently implemented are:
  - `GET /health`
  - `GET /blocks`
  - `GET /blocks/{slot}`
  - `GET /transactions`
  - `GET /transactions/{signature}`
  - `GET /tokens/{mint}`
  - `GET /accounts/{address}`
  - `GET /creators/{address}`
  - `GET /creators/{address}/rewards`
  - `GET /creators/{address}/stake`
  - `GET /tokens/transfers`
  - `GET /nfts`
  - `GET /nfts/{tokenId}`
  - `GET /collections/{collectionId}`
  - `GET /posts`
  - `GET /posts/{postId}`
  - `GET /engagement`
  - `GET /stakes`
  - `GET /search`

Current profile behavior:

- `GET /accounts/{address}` returns a composite wallet view with the base profile plus recent transactions, recent posts, social stakes, and creator reward history when present
- `GET /creators/{address}` returns a composite creator view with profile data, post count, reward totals, recent rewards, and related social stake records
- `GET /tokens/{mint}` returns a first-pass AEKO-20 summary derived from indexed snapshot transfers, including holder count, snapshot supply, and recent transfer records
- `GET /collections/{collectionId}` returns a first-pass AEKO-721 collection summary derived from indexed NFT records, including item count, owner count, creator count, and collection items

This API powers:

- AEKO Explorer
- dashboards
- analytics
- compliance and audit tooling
- Aeko Social read surfaces that need indexed history

## Design Rules

- canonical chain truth should remain traceable back to block, transaction, account, or event sources
- derived analytics should be clearly distinguishable from canonical chain fields
- every list endpoint should support pagination
- search should resolve both generic chain entities and SocialFi entities

## Base Response Shape

Suggested shape:

```json
{
  "data": {},
  "meta": {
    "cursor": null,
    "nextCursor": null,
    "network": "testnet",
    "source": "indexer"
  }
}
```

Error shape:

```json
{
  "error": {
    "code": "not_found",
    "message": "block not found"
  }
}
```

## Core Endpoints

### `GET /blocks`

Returns recent blocks.

Suggested query params:

- `limit`
- `before`
- `after`

Response items should include:

- slot
- block hash
- parent slot
- timestamp
- transaction count
- producer

### `GET /blocks/{slot}`

Returns a fully indexed block view.

Suggested fields:

- block metadata
- transactions
- rewards summary if available
- producer details

### `GET /transactions`

Returns indexed transactions.

Suggested query params:

- `limit`
- `before`
- `after`
- `address`
- `type`
- `status`

### `GET /transactions/{signature}`

Returns a full indexed transaction view.

Suggested fields:

- signature
- slot
- status
- error if failed
- fee breakdown
- instruction list
- involved accounts
- logs summary if available

### `GET /accounts/{address}`

Returns a wallet or account profile.

Suggested fields:

- native balance
- token holdings
- NFT holdings
- recent transactions
- account owner / program
- reputation score if wallet-linked

## Token and NFT Endpoints

### `GET /tokens`

Returns token registry and token summaries.

Suggested query params:

- `mint`
- `symbol`
- `limit`

### `GET /tokens/{mint}`

Returns token details.

Suggested fields:

- mint
- name
- symbol
- decimals
- total supply
- holder count
- mint authority status

### `GET /tokens/{mint}/holders`

Returns indexed holders for a token.

### `GET /tokens/{mint}/transfers`

Returns transfer history for a token.

Current first-pass query params:

- `limit`
- `before`
- `after`
- `address`

### `GET /nfts`

Returns indexed NFTs or collections.

Suggested query params:

- `collection`
- `owner`
- `creator`
- `limit`

### `GET /nfts/{tokenId}`

Returns a full NFT detail view.

Suggested fields:

- token id
- collection id
- owner
- creator
- royalty bps
- metadata summary
- freeze state
- ownership history summary

### `GET /collections/{collectionId}`

Returns collection summary and items.

## SocialFi Endpoints

These endpoints depend on the SocialFi layer defined in [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md).

### `GET /posts`

Returns indexed post anchors and post summaries.

Suggested query params:

- `creator`
- `parentPostId`
- `postKind`
- `visibility`
- `limit`
- `before`
- `after`

### `GET /posts/{postId}`

Returns a single post detail view.

Suggested fields:

- canonical post anchor
- creator
- content URI
- content hash
- metadata hash
- timestamps
- engagement summary
- moderation state

### `GET /creators/{address}`

Returns creator profile data.

Suggested fields:

- wallet
- reputation score
- post count
- reward totals
- staker totals
- monetization summary if public

### `GET /creators/{address}/rewards`

Returns creator reward history.

### `GET /creators/{address}/stake`

Returns social staking positions and yield summaries related to the creator.

### `GET /engagement`

Returns indexed engagement activity.

Suggested query params:

- `creator`
- `postId`
- `actionKind`
- `actor`
- `limit`
- `before`
- `after`

### `GET /reputation/{address}`

Returns reputation score and, if policy allows, a score breakdown.

## Search

### `GET /search`

Global search across:

- address
- transaction signature
- block slot
- block hash
- token mint
- collection id
- NFT token id
- post id
- creator wallet

Suggested query params:

- `q`
- `limit`

Suggested response:

```json
{
  "data": {
    "matches": [
      { "type": "address", "value": "..." },
      { "type": "transaction", "value": "..." }
    ]
  },
  "meta": {
    "network": "testnet",
    "source": "indexer"
  }
}
```

## Indexer Responsibilities Behind The API

The explorer backend assumes a live indexer that persists:

- blocks
- transactions
- AEKO-20 events
- AEKO-721 events
- post anchors
- creator rewards
- engagement events
- reputation checkpoints if indexed
- social stake positions

The indexer must support:

- historical backfill
- live tailing
- replay after interruptions
- deduplication
- reorg-aware correction where applicable

## Implementation Notes

- explorer APIs should not duplicate raw RPC methods without adding value
- explorer endpoints are the right place for historical, searchable, enriched, and relational views
- endpoints backed by derived analytics should label those fields clearly
- SocialFi views should distinguish:
  - canonical chain anchor data
  - indexer-derived summaries
  - app-level visibility overlays
