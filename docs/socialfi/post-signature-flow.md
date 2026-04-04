# Post Signature Flow

This document defines the canonical `hash -> sign -> verify -> anchor` flow for Aeko Social posts.

It exists because the current `social-posts` program already anchors immutable post hashes on-chain, but it does not yet fully prove that the anchored content hash was signed as a post payload by the creator wallet.

## Current Status

What exists today:

- the chain stores canonical post anchors in [`programs/social-posts`](/Users/ok/Documents/projects/aeko-chain/programs/social-posts)
- each anchor stores:
  - `content_hash`
  - `metadata_hash`
  - `content_uri`
  - optional `signature_ref`
- only the creator wallet may submit the anchor transaction

What is still missing:

- a dedicated post-signature envelope format
- a deterministic backend hashing contract for Aeko Social
- a canonical verification endpoint contract
- a dedicated on-chain verification path that proves the anchored payload signature, not just the transaction signer

## Goal

Deliverable:

- immutable post verification live

That means:

- the social backend can deterministically hash a post payload
- the creator wallet can sign that payload hash or signable payload
- AEKO Chain can anchor the resulting proof
- anyone can independently verify that the on-chain anchor matches the creator-signed post payload

## Canonical Split Of Responsibility

### Aeko Social Backend

The backend is responsible for:

- building the deterministic post payload
- computing the canonical hash
- requesting or collecting the creator signature
- handling retries and failure cases
- submitting the anchor transaction
- exposing verification endpoints to apps and moderators

### AEKO Chain

The chain is responsible for:

- storing immutable post anchor state
- verifying the transaction authority for the anchoring action
- storing a canonical signature reference or signature envelope
- exposing the anchored proof via RPC and explorer APIs

### Future Stronger Chain Responsibility

If trust-minimized verification is required at protocol level, the chain should also:

- verify an ed25519 post-signature envelope directly
- or verify the presence of a valid ed25519 verification instruction in the same transaction

## Canonical Payload

The post payload must be deterministic before hashing.

Suggested logical payload:

```json
{
  "version": 1,
  "postId": "<32-byte id hex/base58>",
  "creator": "<wallet pubkey>",
  "contentHash": "<32-byte hash>",
  "metadataHash": "<32-byte hash>",
  "contentUri": "<uri>",
  "parentPostId": "<optional 32-byte id>",
  "postKind": "original|reply|repost|quote",
  "createdAtUnix": 1700000000,
  "visibility": "public|followersOnly|permissioned|paid"
}
```

Rules:

- field order must be fixed
- omitted optional fields must be represented consistently
- timestamps must be unix seconds
- hashes must be over canonical serialized bytes, not app-local object order

## Hashing Flow

### Step 1. Hash Post

The backend should:

- build the canonical payload
- serialize it deterministically
- compute:
  - `content_hash`
  - `metadata_hash`
  - `post_signature_payload_hash`

Recommended split:

- `content_hash`
  - user-authored logical content only
- `metadata_hash`
  - rendered metadata bundle used by apps
- `post_signature_payload_hash`
  - full canonical post payload used for signature verification

## Signing Flow

### Step 2. Sign Hash Or Signable Payload

The creator wallet signs either:

- the canonical post payload bytes
- or an AEKO off-chain message wrapping those bytes

Recommended first-pass approach:

- use the canonical payload bytes directly
- store:
  - signer public key
  - signature bytes
  - payload hash
  - signature scheme version

Suggested envelope:

```json
{
  "version": 1,
  "scheme": "ed25519",
  "signer": "<wallet pubkey>",
  "payloadHash": "<32-byte hash>",
  "signature": "<64-byte signature>",
  "signedAtUnix": 1700000000
}
```

## Verification Flow

### Step 3. Verify And Anchor

Minimum first pass:

1. backend verifies the signature off-chain
2. backend submits the post anchor transaction
3. chain stores:
   - post anchor
   - signature reference or signature envelope digest
4. RPC and explorer expose the anchored proof

Stronger future pass:

1. transaction includes ed25519 verification instruction
2. `social-posts` verifies the expected signed payload hash matches the anchor
3. chain stores proof that signature verification happened inside the anchoring transaction

## Verification API Contract

The backend should expose at least:

- `POST /social/posts/hash`
  - returns canonical payload bytes or payload hash
- `POST /social/posts/verify`
  - verifies signature against payload and wallet address
- `POST /social/posts/anchor`
  - anchors verified post on-chain
- `GET /social/posts/:postId/verification`
  - returns anchored proof status

Verification response should include:

- `postId`
- `creator`
- `payloadHash`
- `contentHash`
- `metadataHash`
- `signatureValid`
- `anchored`
- `anchorTransactionSignature`
- `verificationMode`
  - `backend-only`
  - `anchored-reference`
  - `onchain-verified`

## Failure Handling

The backend must distinguish:

- payload serialization mismatch
- hash mismatch
- invalid signature
- signer mismatch
- duplicate post anchor
- chain submission failure
- chain confirmation timeout

Recommended status model:

- `draft`
- `hashed`
- `signed`
- `verified`
- `anchor_pending`
- `anchored`
- `anchor_failed`

## Repo Consequences

To treat this as complete, AEKO should add:

- a backend integration doc and endpoint contract
- a canonical post-signature payload builder in the backend or shared SDK
- `signature_ref` exposure in RPC responses
- ideally a stronger `VerifyAndAnchorPost` or equivalent transaction pattern in the social-posts contract

## Acceptance Criteria

This flow is complete when:

- Aeko Social can deterministically hash and sign posts
- backend verification endpoints exist
- anchored posts expose verification status through RPC or explorer
- failure modes are explicit and retryable
- chain truth and backend truth agree on the same canonical payload hash
