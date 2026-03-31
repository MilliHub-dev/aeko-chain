# AEKO-721 Public Testnet Walkthrough

Status: Operator-ready, awaiting live public account publication

This document defines how to publish a canonical AEKO-721 example on testnet so the web demo, docs, wallets, and explorers all point at the same public asset.

## Goal

Publish one stable public example:

- collection: `AEKO Genesis Passes`
- token: `Genesis Pass #1`
- token id: `1`
- royalty: `500 bps`
- metadata URI: `ar://genesis-pass-1`

## Canonical Seeds

Use the same deterministic seeds already baked into the web demo:

- collection seed: `aeko-genesis-collection`
- token seed: `aeko-genesis-token-1`

These should be derived from the chosen public base authority wallet so anyone can reproduce the expected addresses locally.

## Publish Flow

1. Choose the public authority / fee payer wallet that will own the canonical collection.
2. Use the AEKO-721 demo setup panel or CLI tooling to derive:
   - collection address
   - token address
3. Create and sign the collection setup transaction:
   - `CreateAccountWithSeed`
   - `InitializeCollection`
4. Create and sign the first NFT transaction:
   - `CreateAccountWithSeed`
   - `MintNft`
5. Confirm both transactions on AEKO testnet.
6. Verify the public state through:
   - JSON-RPC `getAccountInfo`
   - AEKO explorer
   - the web NFT demo live-read panel

## Web Demo Configuration

After publication, wire the canonical public addresses into the web app with these environment values:

```bash
VITE_AEKO_DEMO_RPC=https://api.testnet.aeko.chain
VITE_AEKO_DEMO_COLLECTION=<published-collection-address>
VITE_AEKO_DEMO_TOKEN=<published-token-address>
VITE_AEKO_DEMO_COLLECTION_SEED=aeko-genesis-collection
VITE_AEKO_DEMO_TOKEN_SEED=aeko-genesis-token-1
```

With those values present, the NFT demo will mark the canonical example as `live` and expose one-click loading of the published accounts.

## Verification Checklist

- collection owner matches the AEKO-721 program id
- token owner matches the AEKO-721 program id
- collection name is `AEKO Genesis Passes`
- collection symbol is `AGEN`
- token id is `1`
- royalty is `500 bps`
- metadata URI is `ar://genesis-pass-1`
- token is not frozen on first publication

## Public References To Update

Once the accounts are live, update these surfaces together:

- [`web/src/data/nftDemoExamples.js`](/Users/ok/Documents/projects/aeko-chain/web/src/data/nftDemoExamples.js)
- [`docs/token-standards/nft-demo.md`](/Users/ok/Documents/projects/aeko-chain/docs/token-standards/nft-demo.md)
- [`docs/token-standards/aeko-721.md`](/Users/ok/Documents/projects/aeko-chain/docs/token-standards/aeko-721.md)

## Current Boundary

This repository now contains:

- the AEKO-721 reference program
- the web demo lifecycle simulator
- live-read support
- wallet-oriented transaction construction
- canonical example slots in the web UI

What it does not yet contain is the actual published public testnet collection and token accounts. That last step must be executed against a live wallet and testnet RPC.
