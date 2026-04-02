# Phase 4 Validation Commands

This document provides the command-level entry points for the Phase 4 validation helpers.

Use it with:

- [`docs/wallet/wallet-core-testnet-validation.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-core-testnet-validation.md)
- [`docs/wallet/wallet-permissions-testnet-validation.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-permissions-testnet-validation.md)
- [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md)

## Wallet Core Helper

Source:

- [`wallet-core/examples/keystore_validation.rs`](/Users/ok/Documents/projects/aeko-chain/wallet-core/examples/keystore_validation.rs)
- [`wallet-core/examples/keystore_testnet_submit.rs`](/Users/ok/Documents/projects/aeko-chain/wallet-core/examples/keystore_testnet_submit.rs)

Command:

```bash
cargo run -p aeko-wallet-core --example keystore_validation
```

Live testnet submission:

```bash
AEKO_TESTNET_RPC=https://api.testnet.aeko.chain \
AEKO_WALLET_KEYSTORE_PATH=/path/to/keystore.json \
AEKO_WALLET_PASSWORD=... \
AEKO_RECIPIENT_PUBKEY=<recipient-pubkey> \
AEKO_TRANSFER_LAMPORTS=1000000 \
cargo run -p aeko-wallet-core --example keystore_testnet_submit
```

What it proves:

- wallet creation works
- mnemonic restore works
- encrypted keystore import works
- message signing works
- stateless signing works
- batch signing works

What to capture:

- wallet public key
- wallet DID
- stateless payload hash
- batch count
- live transfer tx signature

## Wallet Permissions Helper

Source:

- [`wallet-core/examples/permission_validation.rs`](/Users/ok/Documents/projects/aeko-chain/wallet-core/examples/permission_validation.rs)
- [`wallet-core/examples/permissions_testnet_submit.rs`](/Users/ok/Documents/projects/aeko-chain/wallet-core/examples/permissions_testnet_submit.rs)

Command:

```bash
cargo run -p aeko-wallet-core --example permission_validation
```

Live testnet submission:

```bash
AEKO_TESTNET_RPC=https://api.testnet.aeko.chain \
AEKO_WALLET_KEYSTORE_PATH=/path/to/keystore.json \
AEKO_WALLET_PASSWORD=... \
AEKO_DELEGATE_PUBKEY=<delegate-pubkey> \
AEKO_ALLOWED_PROGRAM_ID=<allowed-program-pubkey> \
AEKO_WALLET_PERMISSIONS_PROGRAM_ID=<deployed-permissions-program-id> \
cargo run -p aeko-wallet-core --example permissions_testnet_submit
```

What it proves:

- permission state planning works
- delegate grant planning works
- freeze planning works
- permission transaction signing works
- effective-permission read instruction planning works

What to capture:

- permission state address
- audit log address
- delegate pubkey
- signed transaction counts
- initialize, grant, freeze, unfreeze, update, and revoke tx signatures
- over-cap rejection output
- allowlist rejection output

## Compile-Only Verification

If the operator wants to verify the examples compile before running them:

```bash
cargo check -p aeko-wallet-core --examples
```

## Testnet Execution Notes

The current helper examples are validation scaffolds, not full on-chain submission scripts.

For final closeout:

- use the helper output to verify local signing behavior
- use the runbooks to drive the live AEKO testnet submission and confirmation steps
- record final transaction signatures in [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md)
