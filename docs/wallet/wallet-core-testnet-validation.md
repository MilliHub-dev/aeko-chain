# Wallet Core Testnet Validation

This document defines the live validation flow required to close Ticket 4.1 for Phase 4.

It should be used together with:

- [`docs/wallet/wallet-core-api.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-core-api.md)
- [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md)

## Goal

Prove that the current `wallet-core` implementation works against AEKO testnet for:

- wallet creation
- mnemonic restore
- encrypted keystore export and import
- transaction signing
- message signing
- batch signing
- stateless signing
- Ledger-backed signing where hardware is available

## Environment

Recommended baseline:

- testnet RPC: `https://api.testnet.aeko.chain`
- funded testnet wallet for fee payment
- AEKO CLI installed and configured
- hardware device available if Ledger validation is in scope

## Validation Steps

Helpful starting point:

- [`wallet-core/examples/keystore_validation.rs`](/Users/ok/Documents/projects/aeko-chain/wallet-core/examples/keystore_validation.rs)
- [`docs/wallet/phase4-validation-commands.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-validation-commands.md)

### 1. Local Wallet Creation

Verify:

- a new mnemonic-backed wallet can be created
- the derived public key is stable for the chosen path
- the derived DID matches `did:aeko:<wallet_pubkey>`

Record:

- public key
- DID
- derivation path used

### 2. Encrypted Keystore Roundtrip

Verify:

- keystore export succeeds
- keystore import restores the same public key
- wrong-password import fails cleanly

Record:

- keystore version
- restored public key

### 3. Mnemonic Restore

Verify:

- restoring from mnemonic recreates the same wallet public key
- DID resolution remains consistent

Record:

- restored public key
- restored DID

### 4. Transaction Signing

Verify:

- a testnet transaction is signed by `wallet-core`
- the transaction is accepted by AEKO testnet
- the final tx signature is recorded

Suggested flow:

- use a low-risk self-transfer or equivalent test transaction
- confirm the signature through AEKO RPC or CLI

Record:

- signing wallet public key
- tx signature

### 5. Message Signing

Verify:

- a plain message can be signed
- the resulting signature verifies against the wallet public key

Record:

- message hash or label
- signer public key

### 6. Batch Signing

Verify:

- multiple prepared transactions can be signed in one batch flow
- each signed artifact can still be submitted or verified independently

Record:

- number of transactions in batch
- signature list or verification note

### 7. Stateless Signing

Verify:

- a stateless signing request succeeds without relying on a persisted wallet-app session
- the resulting signature verifies against the expected public key

Record:

- auth context used
- signer public key

### 8. Ledger Path

Only required when hardware is available.

Verify:

- Ledger device discovery succeeds
- account connection succeeds
- public key retrieval succeeds
- message signing succeeds
- transaction signing succeeds

Record:

- Ledger locator or path used
- Ledger-derived public key
- transaction signature if executed on testnet

## Acceptance Criteria

Wallet core validation is complete when:

- all non-hardware checks pass on testnet
- hardware checks pass if Ledger support is part of the release scope
- final tx signatures and verification notes are recorded in [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md)

## Output To Record

Add the following to the Phase 4 closeout record:

- wallet-core testnet validation date
- wallet-core operator
- wallet-core verification notes
- wallet-core transaction signature(s)
- wallet-core message or stateless verification notes
