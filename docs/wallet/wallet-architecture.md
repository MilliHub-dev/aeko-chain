# Wallet Architecture

AEKO Wallets are more than just key holders; they are **Identity Managers**.

This document should be read alongside the canonical identity foundation in [`docs/wallet/identity.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/identity.md).

## Key Concepts

### 1. Keypairs (Ed25519)
Like Aeko, addresses are Ed25519 public keys.
*   **Format**: Base58 encoded string (e.g., `AEko...`).
*   **Derivation**: Compatible with BIP-39/BIP-44 standards.

### 2. Associated Token Accounts (ATA)
Tokens (AEKO-20, NFTs) are not stored "inside" the main wallet address. They are stored in separate accounts *owned* by the wallet.
*   *Benefit**: Allows parallel processing of token transfers.

### 3. Identity Accounts (PDAs)
Every wallet can have an associated **Identity PDA (Program Derived Address)**.
*   This PDA is the canonical on-chain identity state linked to the wallet anchor and AEKO DID.
*   It may hold or reference the user's **Reputation Score**, **Clearance Level** summary, **KYC attestation hash**, and profile metadata.
*   *Security*: The PDA can only be modified by the Identity Program or approved identity-update paths defined by the identity spec.

## Wallet Types

*   **Hot Wallet**: Browser extension / Mobile App. For daily social interactions.
*   **Cold Wallet**: Hardware device (Ledger/Trezor). For high-value asset storage.
*   **Sovereign Wallet**: A specialized hardware wallet (YubiKey) required for L4/L5 military access.
