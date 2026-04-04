# Social Posts Contract

This document defines the canonical on-chain state for SocialFi post anchors and engagement proofs.

It exists to support:

- truthful `getPostAnchor` and `getPostsByCreator` RPC reads
- canonical post ownership and edit history
- replay-protected engagement proofs
- explorer and indexer SocialFi history

## Scope

The social-posts program is responsible for:

- anchoring canonical post metadata on-chain
- preserving versioned metadata changes through edits
- storing protocol-relevant moderation state
- recording engagement proofs with replay protection

It is not responsible for:

- full text or media payload storage
- reward settlement
- monetization payouts
- reputation scoring beyond storing source events

## Current Implementation Progress

- social-posts program added in [`programs/social-posts`](/Users/ok/Documents/projects/aeko-chain/programs/social-posts)
- canonical post-anchor state model implemented
- engagement-proof state model implemented
- initialize / anchor / edit / moderate / engagement / read instruction flow implemented
- duplicate post and replay-guard protections implemented

## Canonical State

Key structs implemented:

- `SocialPostsConfig`
- `PostAnchor`
- `EngagementProof`
- `SocialPostsStateAccount`

Post anchors include:

- `post_id`
- `creator`
- `content_hash`
- `metadata_hash`
- `content_uri`
- `parent_post_id`
- `post_kind`
- `created_at_unix`
- `edited_at_unix`
- `visibility`
- `moderation_state`
- `signature_ref`

Engagement proofs include:

- `proof_id`
- `actor`
- `target_post_id`
- `target_creator`
- `action_kind`
- `action_weight`
- `slot`
- `unix_timestamp`
- `replay_guard`

## Instruction Surface

- `InitializeState`
- `AnchorPost`
- `EditPost`
- `ModeratePost`
- `RecordEngagement`
- `ReadPostsState`

## Rules

- post anchors must be unique by `post_id`
- content URIs must be non-empty and within configured length bounds
- only the creator may edit a post
- edits update hashes and URI while preserving the original `post_id`
- only program authority may update moderation state
- engagement proofs must be unique by both `proof_id` and `replay_guard`

## RPC Consequences

This program is the intended canonical source for:

- `getPostAnchor`
- `getPostsByCreator`

It is also the source event layer for:

- `getEngagementEvents`
- future engagement-score derivation
