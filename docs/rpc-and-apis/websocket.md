# WebSocket API

This document defines AEKO Chain's real-time subscription surface for Phase 5.

The WebSocket layer is the live event channel for wallets, explorers, backend services, and Aeko Social clients.

It should stay aligned with:

- [`docs/rpc-and-apis/rpc-reference.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/rpc-reference.md)
- [`docs/rpc-and-apis/rate-limits.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/rate-limits.md)
- [`docs/socialfi/socialfi.md`](/Users/ok/Documents/projects/aeko-chain/docs/socialfi/socialfi.md)

## Goals

The WebSocket surface should support:

- real-time account updates
- transaction and log subscriptions
- explorer live feeds
- SocialFi event streams
- reliable reconnect behavior for application clients

## Connection Model

Clients connect to the cluster WebSocket endpoint for the selected network.

The endpoint and auth requirements depend on deployment tier:

- public tier
  - no persistent secret required
  - stricter connection and subscription limits
- developer tier
  - higher limits
  - optional API key or signed challenge flow
- partner / permissioned tier
  - auth required
  - tier-specific access to protected channels

## Base Request Shape

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "accountSubscribe",
  "params": ["<ACCOUNT_PUBKEY>", { "commitment": "confirmed" }]
}
```

Base notification shape:

```json
{
  "jsonrpc": "2.0",
  "method": "accountNotification",
  "params": {
    "result": {
      "context": { "slot": 12345 },
      "value": {}
    },
    "subscription": 42
  }
}
```

## Core Subscription Methods

### `accountSubscribe`

Subscribe to updates on a specific account.

Use cases:

- wallet balance updates
- token account changes
- NFT ownership changes
- permission account updates

Recommended params:

- account pubkey
- optional config:
  - `encoding`
  - `commitment`

### `programSubscribe`

Subscribe to changes for accounts owned by a program.

Use cases:

- AEKO-20 mint or account changes
- AEKO-721 collection or token changes
- wallet-permissions program changes
- SocialFi contract state changes

Recommended params:

- program id
- optional filters
- optional config

### `logsSubscribe`

Subscribe to transaction logs.

Use cases:

- explorer live transaction feed
- contract event ingestion
- app-level activity listeners

Recommended params:

- filter by mentions, all, or specific program
- optional commitment

### `signatureSubscribe`

Subscribe to a transaction signature until it reaches the desired confirmation state.

Use cases:

- wallet UX
- explorer confirmation updates
- backend job completion watchers

## SocialFi Event Channels

Phase 5 should define real-time channels for SocialFi-specific events.

These may be implemented as dedicated methods or as filtered `logsSubscribe` / `programSubscribe` patterns.

Minimum event families:

- post events
  - new post anchor
  - post edit metadata update if enabled
  - moderation state changes
- reward events
  - reward epoch settlement
  - reward claim
- engagement events
  - engagement proof accepted
  - engagement proof rejected
  - score changes if emitted
- reputation events
  - reputation checkpoint updates
  - penalty or slash events
- social staking events
  - stake opened
  - unstake requested
  - yield claimed

Suggested notification pattern:

```json
{
  "jsonrpc": "2.0",
  "method": "socialEventNotification",
  "params": {
    "subscription": 99,
    "result": {
      "context": { "slot": 12345 },
      "value": {
        "eventType": "RewardClaimed",
        "entityId": "creator_pubkey_or_position_id",
        "data": {}
      }
    }
  }
}
```

## Unsubscribe Methods

Each subscription type should expose a matching unsubscribe method:

- `accountUnsubscribe`
- `programUnsubscribe`
- `logsUnsubscribe`
- `signatureUnsubscribe`

If dedicated SocialFi channels are added, they should also expose explicit unsubscribe methods.

## Reconnection and Delivery Semantics

The WebSocket layer should define clear client expectations:

- subscriptions are connection-scoped
- reconnect requires re-subscription unless session recovery is explicitly implemented
- clients should treat notifications as at-least-once, not exactly-once
- clients should use slot, signature, or event id for deduplication
- order should be treated as best-effort across reconnect boundaries

## Auth for Permissioned Channels

Protected channels may require:

- API key
- signed wallet challenge
- backend service token

Permissioned channels should be used for:

- restricted institutional or compliance streams
- military / fintech deployment-specific flows
- privileged moderation or audit feeds

Public channels should never silently expose protected data.

## Example

```javascript
const ws = new WebSocket('wss://api.testnet.aeko.chain');

ws.onopen = () => {
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'accountSubscribe',
    params: ['<ACCOUNT_PUBKEY>', { commitment: 'confirmed' }]
  }));
};

ws.onmessage = (event) => {
  console.log('Update received:', JSON.parse(event.data));
};
```

## Operational Requirements

- connection limits must follow [`docs/rpc-and-apis/rate-limits.md`](/Users/ok/Documents/projects/aeko-chain/docs/rpc-and-apis/rate-limits.md)
- idle timeout behavior should be documented by environment
- server-side heartbeat or ping expectations should be documented by environment
- subscription failures must return structured error payloads

## Phase 5 Implementation Notes

- core explorer and wallet flows should rely on WebSocket for live updates, not aggressive polling
- SocialFi event streams should be designed so explorer and app backends can index from them without depending on fragile log parsing alone
- any deployment that does not yet support dedicated SocialFi channels should state that explicitly and document the filtered-log fallback
