# RPC Reference

This document defines the implementation-facing RPC surface for AEKO Chain in Phase 5.

It covers:

- baseline chain RPC methods
- SocialFi RPC extensions
- request and response conventions
- pagination, filtering, and commitment expectations

This page should stay aligned with:

- [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md)
- [`docs/rpc-and-apis/websocket.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/websocket.md)
- [`docs/rpc-and-apis/rate-limits.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/rate-limits.md)

## Conventions

AEKO RPC uses JSON-RPC 2.0.

Base request shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getAccountInfo",
  "params": ["<PUBKEY>", { "encoding": "base64", "commitment": "confirmed" }]
}
```

Base success shape:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "context": { "slot": 12345 },
    "value": {}
  },
  "id": 1
}
```

Base error shape:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Invalid request",
    "data": {
      "reason": "missing required parameter",
      "retryable": false
    }
  },
  "id": 1
}
```

### Commitment

Supported commitment values:

- `processed`
- `confirmed`
- `finalized`

If omitted, clients should assume the endpoint default documented in deployment docs.

### Pagination

List-style methods should support:

- `limit`
- `before`
- `after`
- method-specific filters where applicable

Cursor-based pagination is preferred over page-number pagination for chain and event history endpoints.

## Core Chain RPC

### `sendTransaction`

Submits a signed transaction to the cluster for validation and broadcast.

Parameters:

- `transaction` (string)
  - serialized signed transaction, typically base64
- `config` (object, optional)
  - `encoding`
  - `skipPreflight`
  - `preflightCommitment`
  - `maxRetries`

Returns:

- transaction signature
- optional submission metadata in `data`

Example result:

```json
{
  "jsonrpc": "2.0",
  "result": "5n9Y...sig",
  "id": 1
}
```

### `getSignatureStatuses`

Returns confirmation and execution status for one or more signatures.

Parameters:

- array of signatures
- optional config object

Returns:

- slot
- confirmation status
- error status if failed

### `getLatestBlock`

Returns the latest known block summary.

Suggested returned fields:

- `slot`
- `blockhash`
- `parentSlot`
- `blockTime`
- `transactionCount`
- `producer`

### `getBlock`

Returns a full block by slot.

Parameters:

- `slot` (u64)
- optional config:
  - `encoding`
  - `transactionDetails`
  - `maxSupportedTransactionVersion`
  - `commitment`

Suggested returned fields:

- block metadata
- transaction list
- rewards if applicable
- producer or leader

### `getBlocks`

Returns a range of blocks.

Parameters:

- `startSlot`
- `endSlot`
- optional config

### `getAccountInfo`

Returns all information associated with a given account.

Parameters:

- `pubkey`
- optional config:
  - `encoding`
  - `commitment`
  - `dataSlice`

Example response:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "context": { "slot": 1 },
    "value": {
      "data": ["base64...", "base64"],
      "executable": false,
      "lamports": 1000000000,
      "owner": "11111111111111111111111111111111",
      "rentEpoch": 0
    }
  },
  "id": 1
}
```

### `getBalance`

Returns the native AEKO balance of a wallet or account.

Parameters:

- `pubkey`
- optional config with `commitment`

Returns:

- lamports
- slot context

### `getTokenAccountsByOwner`

Returns fungible token accounts owned by a wallet.

Parameters:

- owner pubkey
- token filter by mint or program id
- optional config

Returns:

- token account pubkeys
- mint
- owner
- amount
- frozen state if relevant

### `getNftAccountsByOwner`

Returns AEKO-721 token accounts or ownership records for a wallet.

Parameters:

- owner pubkey
- optional collection filter
- optional config

Returns:

- NFT account list
- collection id
- token id
- owner
- metadata summary

### `getProgramAccounts`

Returns accounts owned by a program, with optional filters.

Parameters:

- program id
- optional config:
  - `commitment`
  - `encoding`
  - `filters`
  - `dataSlice`

Filter support should include:

- memcmp or byte-match filters
- data-size filters
- method-specific discriminant filters if needed

## SocialFi RPC Extensions

These methods depend on the SocialFi state model defined in [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md).

### `getPostAnchor`

Returns the canonical on-chain anchor for a post.

Parameters:

- `postId`

Returns:

- `postId`
- `creator`
- `contentHash`
- `metadataHash`
- `contentUri`
- `parentPostId`
- `postKind`
- `createdAtUnix`
- `editedAtUnix`
- `visibility`
- `moderationState`

### `getPostsByCreator`

Returns post anchors for a creator.

Parameters:

- creator pubkey
- optional cursor
- optional `limit`
- optional `postKind`

### `getCreatorRewards`

Returns reward totals for a creator.

Parameters:

- creator pubkey
- optional epoch range

Returns:

- total earned
- total claimed
- total claimable
- epoch breakdowns

### `getCreatorRewardEpoch`

Returns a single creator's reward data for an epoch.

Parameters:

- creator pubkey
- epoch

### `getClaimableRewards`

Returns the claimable reward balance for a creator wallet.

Parameters:

- creator pubkey

### `submitEngagementProof`

Submits a signed transaction that contains a `social-posts` `RecordEngagement` instruction.

Parameters:

- signed serialized transaction
- standard send-transaction config:
  - `encoding`
  - `skipPreflight`
  - `preflightCommitment`
  - `maxRetries`
  - `minContextSlot`

Returns:

- proof id
- acceptance flag
- slot observed at submission time

### `getEngagementScore`

Returns engagement score or point totals for a wallet or creator.

Parameters:

- target pubkey
- optional range

### `getEngagementEvents`

Returns indexed engagement proofs or events.

Parameters:

- target creator or post id
- optional action filter
- optional cursor and limit

### `getReputationScore`

Returns the reputation score for a wallet.

Parameters:

- wallet pubkey

Returns:

- overall score
- tier or status
- optional component breakdown if public by policy

### `getSocialStakePositions`

Returns social staking positions for a staker or creator.

Parameters:

- wallet pubkey
- optional role filter: `staker` or `creator`

Returns:

- position id
- creator
- staker
- amount
- state
- accumulated yield
- claimed yield

### `stakeBehindCreator`

Submits a signed transaction that contains a `social-staking` `OpenPosition` instruction.

Parameters:

- signed serialized transaction
- standard send-transaction config

### `unstakeBehindCreator`

Submits a signed transaction that contains either a `social-staking` `RequestUnstake` or `FinalizeUnstake` instruction.

Parameters:

- signed serialized transaction
- standard send-transaction config

### `claimSocialStakeYield`

Submits a signed transaction that contains a `social-staking` `ClaimStakeYield` instruction.

Parameters:

- signed serialized transaction
- standard send-transaction config

## Standardized Error Classes

RPC methods should map failures into stable categories:

- `InvalidParams`
- `NotFound`
- `PreflightFailure`
- `SignatureVerificationFailed`
- `RateLimited`
- `Unauthorized`
- `PermissionDenied`
- `UnsupportedForTier`
- `TemporarilyUnavailable`
- `InternalError`

SocialFi-specific methods may also return:

- `SpamGuardTriggered`
- `ReputationTooLow`
- `StakeRequirementNotMet`
- `RewardNotClaimable`
- `PositionCoolingDown`

## Implementation Notes

- core chain methods should be canonical and directly backed by chain state
- SocialFi methods may be canonical, derived, or hybrid, but must be documented as such
- any method backed by indexer-derived data should make that clear in its docs and response metadata where useful
- write methods should document preconditions, anti-replay rules, and rate-limit implications

## Immediate Follow-On

The websocket and explorer API docs should be kept in sync with this reference:

- [`docs/rpc-and-apis/websocket.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/websocket.md)
- [`docs/rpc-and-apis/explorer-api.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/explorer-api.md)
