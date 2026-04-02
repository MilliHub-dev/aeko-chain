# Wallet Core API Spec

Status: Draft for Ticket 4.1

Owner: AEKO core team

Scope: This document defines the core wallet API for key generation, key storage, signing, import/export, and stateless signature support.

This spec depends on [`docs/wallet/identity.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/identity.md).

## 1. Purpose

The wallet core is the base layer for:

- local wallet creation
- secure key storage
- transaction and message signing
- stateless signing flows
- backup and restore
- hardware wallet integration

Permission controls and SDK wallet helpers should build on this API rather than re-implementing their own signing primitives.

Current Rust implementation status:

- `wallet-core` now includes a permission helper layer for the wallet-permissions program
- it can build wallet-permission instructions and unsigned transactions for initialize, grant, update, revoke, freeze, unfreeze, usage recording, and permission reads
- it can sign those permission transactions with either encrypted local keystores or Ledger-backed accounts
- runnable validation examples now live in [`wallet-core/examples`](/Users/ok/Documents/projects/aeko-chain/wallet-core/examples)

## 2. Key Management Requirements

Wallet core must support:

- Ed25519 keypair generation
- BIP39 mnemonic generation
- deterministic key derivation
- import from mnemonic
- import from encrypted keystore
- export to encrypted keystore

Suggested derivation baseline:

- mnemonic: BIP39
- derivation path family: BIP44-compatible AEKO path

Open implementation detail:

- exact AEKO coin type constant must be finalized before production release

## 3. Core API Surface

Suggested TypeScript-style interface:

```ts
interface WalletCore {
  createWallet(input?: CreateWalletInput): Promise<WalletHandle>;
  importFromMnemonic(input: MnemonicImportInput): Promise<WalletHandle>;
  importFromKeystore(input: KeystoreImportInput): Promise<WalletHandle>;
  exportKeystore(input: KeystoreExportInput): Promise<EncryptedKeystore>;
  getPublicKey(walletId: string): Promise<string>;
  getDid(walletId: string): Promise<string>;
  signTransaction(input: SignTransactionInput): Promise<SignedTransaction>;
  signMessage(input: SignMessageInput): Promise<SignedMessage>;
  signBatch(input: SignBatchInput): Promise<SignedBatch>;
  signStateless(input: StatelessSignInput): Promise<StatelessSignature>;
  listAccounts(): Promise<WalletSummary[]>;
  removeWallet(walletId: string): Promise<void>;
}
```

## 4. Input / Output Models

### Create Wallet

```ts
type CreateWalletInput = {
  mnemonicWords?: 12 | 24;
  derivationPath?: string;
  password: string;
  label?: string;
};
```

Output:

- wallet id
- public key
- DID
- encrypted local keystore record
- mnemonic shown once to the user

### Import From Mnemonic

```ts
type MnemonicImportInput = {
  mnemonic: string;
  derivationPath?: string;
  password: string;
  label?: string;
};
```

### Sign Transaction

```ts
type SignTransactionInput = {
  walletId: string;
  transaction: string;
  encoding: 'base64';
  requireSimulation?: boolean;
};
```

### Sign Message

```ts
type SignMessageInput = {
  walletId: string;
  message: Uint8Array | string;
};
```

### Sign Batch

```ts
type SignBatchInput = {
  walletId: string;
  transactions: Array<{
    transaction: string;
    encoding: 'base64';
  }>;
};
```

### Stateless Sign

```ts
type StatelessSignInput = {
  publicKey: string;
  payload: Uint8Array | string;
  authContext: 'military' | 'fintech' | 'general';
  sessionPersistence: 'none';
};
```

Interpretation:

- stateless signing means the signing request should not depend on a persisted wallet-app session
- it may still require explicit user or hardware authorization for every request

## 5. Keystore Model

Encrypted keystore requirements:

- password-protected
- versioned
- portable
- metadata-safe for backup

Suggested fields:

```json
{
  "version": 1,
  "publicKey": "<base58>",
  "did": "did:aeko:<wallet_pubkey>",
  "crypto": {
    "cipher": "aes-256-gcm",
    "kdf": "argon2id"
  },
  "meta": {
    "createdAt": "<iso8601>",
    "label": "Primary Wallet"
  }
}
```

## 6. Hardware Wallet Support

Minimum hardware path:

- Ledger integration for account discovery
- public key retrieval
- transaction signing
- message signing where supported
- stateless off-chain signing where supported by the Ledger path

Rules:

- secret material must never leave the hardware device
- wallet core should expose the same signing interface for local and hardware-backed accounts where practical

Current Rust implementation status:

- `wallet-core` supports Ledger device discovery
- `wallet-core` supports Ledger account connection by locator or host path
- `wallet-core` supports Ledger-backed message signing
- `wallet-core` supports Ledger-backed transaction signing
- `wallet-core` supports Ledger-backed batch signing
- `wallet-core` supports Ledger-backed stateless payload signing
- testnet validation is still pending

## 7. Security Requirements

- mnemonic must be displayed only at creation or explicit backup flow
- private keys must never be stored unencrypted at rest
- sign flows should support pre-sign simulation or intent preview
- wallet core should expose the resolved DID and public key consistently
- failed decrypt or auth attempts should not leak secret material

## 8. Testnet Deployment Expectations

Ticket 4.1 is not complete until wallet core is tested on testnet for:

- transaction signing
- message signing
- batch signing
- restore from mnemonic
- restore from encrypted keystore
- hardware-backed signing path where available

## 9. Follow-On Dependencies

This spec feeds:

- wallet permission controls
- wallet adapter implementation
- JS and Node.js SDK wallet helpers
- Rust and Python wallet helper layers where applicable
