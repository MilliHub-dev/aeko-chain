# AEKO-20 Token Standard

Status: Draft implementation spec

AEKO-20 is the canonical fungible token standard for AEKO Chain. It is intended to support native AEKO assets, application tokens, treasury-managed assets, and validator-emission-aware mint flows.

This document defines the target behavior for the reference implementation.

## 1. Objectives

AEKO-20 must provide:

- fungible mint and account state
- authority-gated minting
- transfer and burn semantics
- allowance support through `approve` and `transferFrom`
- compatibility with tokenomics-controlled emission and supply policies
- optional transfer hooks for identity-aware or permissioned assets

## 2. Core State

### Mint

```rust
pub struct Aeko20Mint {
    pub mint_authority: Option<Pubkey>,
    pub freeze_authority: Option<Pubkey>,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: u128,
    pub supply_cap: Option<u128>,
    pub metadata_uri: Option<String>,
    pub transfer_hook_program_id: Option<Pubkey>,
    pub required_clearance: Option<u8>,
    pub mint_policy: MintPolicy,
    pub is_initialized: bool,
}
```

### Token Account

```rust
pub struct Aeko20Account {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub balance: u128,
    pub frozen: bool,
}
```

### Allowance

```rust
pub struct AllowanceRecord {
    pub owner: Pubkey,
    pub spender: Pubkey,
    pub mint: Pubkey,
    pub amount: u128,
    pub expires_at_epoch: Option<u64>,
}
```

## 3. Mint Policy

```rust
pub enum MintPolicy {
    FixedSupply,
    AuthorityGated,
    EmissionsControlled,
    PublicMintControlled,
}
```

Policy meanings:

- `FixedSupply`: no minting after initial issuance
- `AuthorityGated`: mint authority may issue supply
- `EmissionsControlled`: minting only through tokenomics-driven reward flows
- `PublicMintControlled`: minting only through the public minting module

## 4. Instruction Surface

The reference program should support:

- `InitializeMint`
- `InitializeAccount`
- `MintTo`
- `MintPublicTo`
- `Transfer`
- `Burn`
- `Approve`
- `Revoke`
- `TransferFrom`
- `FreezeAccount`
- `ThawAccount`
- `SetMintAuthority`
- `SetTransferHook`

## 5. Metadata Rules

Minimum metadata fields:

- name
- symbol
- decimals
- optional supply cap
- optional metadata URI

Validation requirements:

- name must be non-empty
- symbol must be non-empty and bounded
- decimals must be within a valid range
- supply cap must not conflict with the mint policy

## 6. Transfer Rules

Transfers must enforce:

- source account belongs to the mint
- destination account belongs to the mint
- sender is owner or approved spender
- sufficient balance exists
- source account is not frozen
- optional clearance or transfer-hook checks pass

## 7. Burn Rules

Burning must:

- reduce source account balance
- reduce mint total supply
- emit a burn event

AEKO-20 burns are distinct from chain-level fee burning.

## 8. Allowance Rules

Allowance logic must support:

- exact amount approval
- decrement on `transferFrom`
- optional expiry
- explicit revoke

## 9. Tokenomics Integration

AEKO-20 must integrate with the tokenomics program for:

- emission-aware mint policies
- supply accounting compatibility
- treasury and validator reward issuance flows

Recommended integration path:

- tokenomics settles an epoch
- tokenomics records validator reward distributions
- AEKO-20 executes minting only through approved `EmissionsControlled` authority paths
- public issuance uses `MintPublicTo` for mints configured as `PublicMintControlled`

## 10. Security Requirements

The implementation must reject:

- unauthorized minting
- mint overflow
- balance underflow
- allowance overspend
- transfer across mismatched mints
- frozen-account transfers

## 11. Implementation Status

- [x] High-level AEKO-20 implementation spec written
- [ ] Reference program scaffolded
- [ ] Mint/account state implemented
- [ ] Transfer and burn logic implemented
- [ ] Allowance logic implemented
- [ ] Tokenomics mint integration implemented
- [ ] Public mint guard path implemented
