# AEKO Identity & DID Spec

Status: Draft for Phase 4 implementation

Owner: AEKO core team

Scope: This document defines the identity foundation for Phase 4. It is the source of truth for DID format, wallet-anchored identity, optional KYC anchoring, and the reputation score structure used by wallets, permission controls, and SDKs.

## 1. Purpose

AEKO wallets are not just key containers. They are the primary identity anchor for users, applications, and permission-aware flows across AEKO Chain.

This spec exists to define:

- how a DID is represented on AEKO
- how a wallet address anchors identity
- where identity data lives on-chain
- how optional KYC proofs are attached without exposing raw personal data
- how reputation is structured and updated

All Phase 4 wallet, permission, and SDK work should align to this document.

## 2. Identity Model

AEKO identity has four layers:

1. wallet address
2. DID record
3. Identity PDA
4. optional credentials and reputation attachments

Interpretation:

- the wallet address is the root cryptographic anchor
- the DID is the portable identity identifier
- the Identity PDA is the canonical on-chain state account for profile and identity metadata
- credentials, clearance proofs, KYC proofs, and reputation data attach to that identity state

## 3. Primary Identity Anchor

The primary identity anchor on AEKO is the wallet public key.

Rules:

- one wallet may control one primary on-chain identity record
- a user may own multiple wallets, but each wallet resolves independently unless linked through an explicit identity-linking mechanism
- all wallet-based identity actions must be authorized by the wallet owner or an approved delegated authority

Why this model:

- it matches the current wallet architecture docs
- it keeps identity tied to the signing authority
- it avoids introducing a parallel root identity system before wallet controls exist

## 4. DID Schema

### 4.1 DID Method

AEKO should use a chain-specific DID method:

```text
did:aeko:<wallet_pubkey>
```

Example:

```text
did:aeko:7Yh...abc
```

The method-specific identifier is the base58 AEKO wallet public key.

### 4.2 DID Resolution

Resolution flow:

1. parse `did:aeko:<wallet_pubkey>`
2. derive the Identity PDA from the wallet public key
3. load the Identity PDA
4. return the resolved DID document and linked identity state

### 4.3 DID Document Minimum Fields

Minimum AEKO DID document:

```json
{
  "id": "did:aeko:<wallet_pubkey>",
  "controller": "did:aeko:<wallet_pubkey>",
  "verificationMethod": [
    {
      "id": "did:aeko:<wallet_pubkey>#owner",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:aeko:<wallet_pubkey>",
      "publicKeyBase58": "<wallet_pubkey>"
    }
  ],
  "authentication": [
    "did:aeko:<wallet_pubkey>#owner"
  ],
  "assertionMethod": [
    "did:aeko:<wallet_pubkey>#owner"
  ],
  "service": [
    {
      "id": "did:aeko:<wallet_pubkey>#profile",
      "type": "AekoIdentityProfile",
      "serviceEndpoint": "aeko:pda:<identity_pda>"
    }
  ]
}
```

### 4.4 DID Update Policy

The following are mutable:

- profile metadata references
- service endpoints
- linked credentials
- delegated keys if supported later

The following are immutable:

- DID method
- root wallet anchor

## 5. On-Chain Identity Storage

Identity state should live in a dedicated Identity PDA derived from the wallet address.

Suggested derivation model:

```text
IdentityPDA = PDA("identity", wallet_pubkey)
```

### 5.1 Identity PDA Responsibilities

The Identity PDA should hold:

- wallet anchor
- DID string or deterministic DID components
- profile metadata pointer
- clearance level summary
- KYC proof hash reference if present
- reputation summary
- identity status flags
- timestamps and versioning data

### 5.2 Suggested State Shape

```rust
pub struct IdentityAccount {
    pub wallet: Pubkey,
    pub did_method: String,
    pub did_identifier: String,
    pub profile_uri: Option<String>,
    pub profile_hash: Option<[u8; 32]>,
    pub clearance_level: u8,
    pub kyc_status: KycStatus,
    pub kyc_attestation_hash: Option<[u8; 32]>,
    pub reputation: ReputationScore,
    pub linked_credentials: Vec<CredentialRef>,
    pub is_frozen: bool,
    pub created_at_epoch: u64,
    pub updated_at_epoch: u64,
}
```

## 6. Wallet-Based Identity

AEKO wallet behavior should assume:

- the connected wallet is the identity controller by default
- wallets can request identity reads through the wallet adapter
- identity-sensitive writes require explicit signature approval
- delegated app permissions must never silently overwrite the root identity anchor

Wallet API implication:

- `window.aeko` or later typed wallet adapters should expose identity-read flows aligned to this spec

## 7. Profile Data Model

Profile data should be split into:

- compact on-chain summary
- richer off-chain profile payload

### 7.1 On-Chain Summary

Recommended on-chain fields:

- display name hash or short display name
- profile URI
- avatar URI hash
- public reputation score
- clearance level summary

### 7.2 Off-Chain Profile Payload

Recommended off-chain fields:

- display name
- bio
- avatar URI
- website
- social handles
- app-specific metadata

Off-chain payloads should be content-addressed where possible.

## 8. Optional KYC Module

KYC is optional and should not be required for baseline AEKO usage.

### 8.1 KYC Boundary

KYC verification happens off-chain through approved identity providers.

On-chain AEKO should store:

- provider id
- verification tier
- attestation hash
- issued-at / expires-at metadata

AEKO should not store:

- raw government documents
- personal photos
- full legal identity payloads

### 8.2 KYC Status Model

```rust
pub enum KycStatus {
    None,
    Pending,
    VerifiedLevel1,
    VerifiedLevel2,
    Revoked,
    Expired,
}
```

### 8.3 KYC Attestation Rule

The on-chain record should store a hash of the off-chain verification package, not the package itself.

Suggested attestation input:

```text
hash(provider_id || wallet_pubkey || verification_level || issued_at || expiry || external_reference)
```

## 9. Clearance & Credential Model

Identity and clearance are related but not identical.

Recommended model:

- DID + Identity PDA define who the wallet is
- SBTs or credential references define what the wallet is allowed to access

Clearance levels should remain compatible with existing docs:

- L0 public / anon
- L1 verified human
- L2 KYC / financial
- L3 enterprise
- L4 government
- L5 military / top secret

Clearance issuers should be explicit trusted identity providers.

## 10. Reputation Score Structure

Reputation should be a structured object, not just a single opaque number.

### 10.1 Reputation Inputs

Reputation may draw from:

- wallet age
- validator or delegator staking participation
- governance participation
- content contribution quality
- moderation history
- successful app interactions
- SocialFi engagement quality
- grants, ecosystem contributions, or protocol development contributions

### 10.2 Reputation Components

Suggested structure:

```rust
pub struct ReputationScore {
    pub total: u32,
    pub behavior_score: u16,
    pub staking_score: u16,
    pub governance_score: u16,
    pub contribution_score: u16,
    pub moderation_penalty: u16,
    pub last_updated_epoch: u64,
}
```

Interpretation:

- `behavior_score` covers safe and compliant usage patterns
- `staking_score` reflects validator or delegator participation
- `governance_score` reflects proposals, voting, and treasury participation
- `contribution_score` reflects ecosystem, builder, and social contribution value
- `moderation_penalty` captures abuse, slashing, or repeated harmful behavior

### 10.3 Reputation Update Model

Recommended rule:

- source events may be produced on-chain or off-chain
- score aggregation may happen off-chain for performance
- final score updates must be posted on-chain by an authorized reputation updater or oracle path
- the update source and timestamp must be auditable

## 11. Identity Resolution API

Minimum resolver behavior:

Input:

- `did:aeko:<wallet_pubkey>`

Output:

- resolved DID document
- Identity PDA address
- profile pointer
- clearance summary
- reputation summary
- KYC summary if authorized for the requester

Suggested SDK surface:

```ts
const identity = await aeko.identity.resolve("did:aeko:<wallet_pubkey>");
```

## 12. Security Rules

- only the wallet controller or approved delegated authority may update mutable identity fields
- KYC hashes must be written only by approved attestation paths
- reputation updates must be auditable and source-attributed
- clearance escalation must never happen through unauthenticated writes
- freezing an identity should not silently destroy history
- identity-linked permissions must be revocable

## 13. Privacy Rules

- public identity should expose only the minimum required data
- sensitive credentials must remain off-chain or encrypted
- KYC should always use hash anchoring, not raw payload storage
- app-level identity access should be permission-scoped

## 14. Dependencies For Phase 4

This spec blocks:

- wallet core API design
- wallet permission controls
- identity extensions in the wallet adapter
- JS / Node.js / Rust / Python SDK identity helpers

## 15. Immediate Follow-On Work

After this document is accepted:

1. update wallet docs to reference this file as the identity source of truth
2. define wallet core API against this identity model
3. define permission controls using this wallet-anchor and DID model
