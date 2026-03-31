# AEKO-721 Demo Path

Status: Web demo implemented, testnet deployment still pending

This document defines the AEKO-721 demo path that now exists in the web app and the remaining work to take it from a live demo surface to a full public testnet workflow.

## Demo Goal

Show a collection authority creating a collection, minting an NFT, freezing it, thawing it, transferring it, and updating metadata.

## Suggested Demo Steps

1. Initialize a collection account with:
   - collection name
   - symbol
   - base URI
2. Mint an NFT into a demo owner wallet with:
   - token id
   - creator
   - royalty bps
   - metadata URI
3. Display the minted NFT details:
   - owner
   - creator
   - royalty bps
   - metadata name and URI
4. Freeze the NFT as creator.
5. Attempt a transfer while frozen and show rejection.
6. Thaw the NFT.
7. Transfer the NFT to a second wallet.
8. Update metadata as creator and display the new metadata.

## Current Demo Coverage

- interactive lifecycle simulation for mint, freeze, thaw, transfer, and metadata updates
- live testnet-backed collection and NFT account reads over JSON-RPC
- client-side decode of the current AEKO-721 Borsh account layout
- typed AEKO wallet adapter layer for connect, disconnect, proof signing, and sign-and-send
- client-side construction of unsigned AEKO-721 legacy transactions for wallet signing
- seed-based derivation of collection and token accounts for fresh demo setup
- rent-exemption lookup plus setup transaction preparation for collection init and first mint
- manual signed-transaction broadcast path for externally signed payloads

## Remaining Demo Gaps

- live publication of the canonical public collection and token accounts described in [`docs/token-standards/nft-public-testnet-walkthrough.md`](/Users/ok/Documents/projects/aeko-chain/docs/token-standards/nft-public-testnet-walkthrough.md)
- broader multi-wallet selection UX if multiple AEKO adapters are injected at once

## Required Accounts

- collection account
- NFT token account
- collection authority signer
- initial owner wallet
- recipient wallet

## Suggested Testnet Story

- Collection: `AEKO Genesis Passes`
- NFT: `Genesis Pass #1`
- Royalty: `500 bps`
- Metadata URI: immutable Arweave or IPFS JSON

## Why This Demo Matters

It proves the core AEKO-721 lifecycle:

- collection creation
- mint
- royalty validation
- moderation-style freeze/thaw
- transfer
- metadata evolution
