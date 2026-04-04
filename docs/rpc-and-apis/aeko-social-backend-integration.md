# Aeko Social Backend Integration

This document defines the Node.js backend integration contract for Aeko Social post verification and anchoring.

It focuses on the production path where Aeko Social remains the application backend, while AEKO Chain provides the immutable anchor layer.

## Goal

Deliverable:

- production-ready integration

That means:

- the backend can hash and verify post payloads deterministically
- the backend can submit verified post anchors to AEKO Chain
- failures are observable and recoverable
- the integration contract is stable enough for production rollout

## Scope

The backend integration covers:

- signature service
- verification endpoints
- chain anchor submission
- failure handling

It does not require the chain to own full text storage or application moderation logic.

## Required Services

### Signature Service

Responsibilities:

- build canonical post payloads
- hash post payloads
- request or accept wallet signatures
- verify ed25519 signatures against creator wallet addresses
- return verification metadata for downstream anchor submission

Minimum inputs:

- creator wallet address
- post payload fields
- signature bytes

Minimum outputs:

- canonical payload hash
- content hash
- metadata hash
- signature validity
- signer match flag

### Verification Endpoints

Recommended endpoints:

- `POST /social/posts/hash`
- `POST /social/posts/verify`
- `POST /social/posts/anchor`
- `GET /social/posts/:postId/verification`

Recommended backend response fields:

- `status`
- `postId`
- `creator`
- `payloadHash`
- `contentHash`
- `metadataHash`
- `signatureValid`
- `anchorSubmitted`
- `anchorTransactionSignature`
- `errorCode`
- `errorMessage`

## Chain Submission Flow

Recommended sequence:

1. client submits post draft to backend
2. backend constructs canonical payload
3. backend returns payload or payload hash for signing
4. client signs with creator wallet
5. backend verifies the signature
6. backend submits `AnchorPost`
7. backend records returned chain signature
8. backend exposes verification status to apps

Current on-chain note:

- the existing `social-posts` contract anchors immutable hashes and requires creator transaction authority
- it does not yet fully verify a post-content signature envelope on-chain

So the current production model should be:

- signature verification in backend
- immutable anchor on chain
- verification status exposed by backend and explorer

## Failure Handling

The backend must explicitly handle:

- invalid request payload
- deterministic serialization mismatch
- hash mismatch
- invalid signature
- signer does not match creator wallet
- duplicate post anchor
- RPC submission error
- confirmation timeout
- partial success
  - backend verified
  - chain anchor pending or failed

Recommended retry policy:

- do not re-sign automatically
- allow safe re-submit of anchor when the same `postId` is still unconfirmed
- mark duplicate anchor attempts idempotently where possible

## Production Notes

The current in-repo Node SDK at [`sdk/node`](/Users/ok/Documents/projects/aeko-chain/sdk/node) already helps with:

- backend RPC connectivity
- prepared transaction signing abstractions
- batch submission helpers
- signature status watching
- deterministic SocialFi post payload building
- post payload hashing
- ed25519 signature verification against AEKO wallet pubkeys
- `AnchorPost` prepared transaction construction

What it does not yet provide:

- post-anchor service endpoints

The current first-pass backend helper surface lives in:

- [`sdk/node/src/socialPosts.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/node/src/socialPosts.ts)
- [`sdk/node/src/socialBackend.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/node/src/socialBackend.ts)

A minimal reference HTTP service now exists at [`sdk/node/examples/social-posts-backend.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/node/examples/social-posts-backend.ts).

That example exposes:

- `POST /social/posts/hash`
- `POST /social/posts/verify`
- `POST /social/posts/anchor`
- `GET /social/posts/:postId/verification`
- `GET /health`

It also now persists first-pass verification records to a local JSON state file, so the reference service is no longer stateless between requests.

The reference service now also demonstrates:

- a pluggable `PostVerificationStore` interface
- a default JSON-file store implementation
- stable machine-readable `errorCode` responses
- a reusable `SocialPostVerificationService` that real backends can import directly

The next backend integration deliverables should therefore be:

- replacement of file-backed reference persistence with production database storage
- wiring the same route contract into the real Aeko Social backend service

## Acceptance Criteria

This backend integration is complete when:

- a signature service exists
- verification endpoints exist
- failures return stable machine-readable codes
- anchor submission returns AEKO transaction signatures
- post verification status is queryable after submission
