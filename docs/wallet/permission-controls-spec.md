# Wallet Permission Controls Spec

Status: Draft for Ticket 4.2

Owner: AEKO core team

Scope: This document defines the on-chain state, policy model, audit log, and instruction surface for AEKO wallet permission controls.

This spec depends on:

- [`docs/wallet/identity.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/identity.md)
- [`docs/wallet/wallet-core-api.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/wallet-core-api.md)

## 1. Purpose

AEKO wallet permission controls exist to let a wallet owner delegate narrowly scoped authority without surrendering the root identity anchor or unrestricted signing power.

This layer must support:

- spend limits
- app allowlists
- multi-role access
- time-locked permissions
- emergency freeze
- auditable grant and revoke history

This document is the implementation-facing foundation for Ticket 4.2.

## 2. Design Goals

- preserve the wallet owner as the root controller
- keep delegated permissions explicit, revocable, and time-bounded
- support both user wallets and application/session delegates
- make every grant, update, revoke, freeze, and unfreeze auditable
- allow identity-aware apps to query effective permission state deterministically

## 3. Identity Alignment

Permission state attaches to the wallet identity anchor defined in [`docs/wallet/identity.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/identity.md).

Rules:

- the wallet public key remains the primary authority
- delegated actors never become the root controller
- permissions may reference a delegate wallet, session key, app id, or program id
- permission state resolution should be deterministic from the wallet anchor

Suggested derivation model:

```text
WalletPermissionPDA = PDA("wallet-permissions", wallet_pubkey)
WalletAuditLogPDA   = PDA("wallet-audit-log", wallet_pubkey, sequence)
```

## 4. Core Roles

AEKO wallet permission controls support three baseline roles:

- `owner`
- `spender`
- `viewer`

### 4.1 Owner

The owner is the wallet root authority.

Capabilities:

- define policy
- grant and revoke delegates
- modify allowlists
- set spend limits
- freeze and unfreeze the wallet permission state
- rotate or delete delegates

### 4.2 Spender

A spender may submit transfers or token interactions within an explicitly granted policy.

Capabilities may include:

- AEKO gas token transfers up to defined caps
- token-20 transfers for allowed mints
- interaction with allowed programs

A spender must never:

- modify policy
- grant additional delegates
- remove owner controls

### 4.3 Viewer

A viewer is read-only.

Capabilities may include:

- read public balances
- read approved token positions
- read NFT inventory
- read identity summary if separately authorized

A viewer must never:

- sign value-moving operations
- manage policy
- freeze or unfreeze the wallet

## 5. Permission State Model

Suggested primary state:

```rust
pub struct WalletPermissionAccount {
    pub wallet: Pubkey,
    pub did: String,
    pub version: u8,
    pub policy_nonce: u64,
    pub is_frozen: bool,
    pub freeze_reason_code: Option<u16>,
    pub reauth_required_until_epoch: Option<u64>,
    pub owner: Pubkey,
    pub delegates: Vec<DelegatePermission>,
    pub default_program_policy: ProgramPolicyMode,
    pub created_at_epoch: u64,
    pub updated_at_epoch: u64,
}
```

Suggested delegate entry:

```rust
pub struct DelegatePermission {
    pub delegate: Pubkey,
    pub role: PermissionRole,
    pub label: Option<String>,
    pub status: PermissionStatus,
    pub valid_from_epoch: u64,
    pub valid_until_epoch: Option<u64>,
    pub spend_limit: SpendLimitPolicy,
    pub program_allowlist: Vec<Pubkey>,
    pub token_allowlist: Vec<Pubkey>,
    pub app_scope_hashes: Vec<[u8; 32]>,
    pub requires_reauth: bool,
    pub last_used_epoch: Option<u64>,
    pub last_used_slot: Option<u64>,
}
```

Supporting enums:

```rust
pub enum PermissionRole {
    Owner,
    Spender,
    Viewer,
}

pub enum PermissionStatus {
    Active,
    Revoked,
    Expired,
    Frozen,
}

pub enum ProgramPolicyMode {
    DenyByDefault,
    AllowByDefault,
}
```

## 6. Spend Limit Model

Spend limits must support:

- per-transaction cap
- daily cap
- per-token cap
- optional rolling-window accounting

Suggested structure:

```rust
pub struct SpendLimitPolicy {
    pub max_single_tx_aeok: Option<u64>,
    pub max_daily_aeok: Option<u64>,
    pub token_caps: Vec<TokenSpendCap>,
}

pub struct TokenSpendCap {
    pub mint: Pubkey,
    pub max_single_tx: Option<u64>,
    pub max_daily: Option<u64>,
}
```

Suggested runtime accounting:

```rust
pub struct DelegateUsageWindow {
    pub delegate: Pubkey,
    pub day_index: u64,
    pub aeko_spent_today: u64,
    pub token_spent_today: Vec<TokenSpendCounter>,
}

pub struct TokenSpendCounter {
    pub mint: Pubkey,
    pub amount: u64,
}
```

Validation rules:

- reject if wallet permission state is frozen
- reject if delegate status is not active
- reject if `current_epoch` is before `valid_from_epoch`
- reject if `current_epoch` is after `valid_until_epoch`
- reject if tx amount exceeds `max_single_tx`
- reject if day-window total would exceed `max_daily`
- reject if mint is not in token allowlist when a token cap exists

## 7. App and Program Permissions

App permissions are enforced through:

- program allowlist
- optional app scope hashes
- explicit revocation

Policy interpretation:

- a delegate may only interact with programs explicitly allowed for that delegate when in `DenyByDefault`
- `AllowByDefault` should be reserved for owner-controlled or high-trust profiles
- app scope hashes should represent signed permission bundles from the wallet or app registration record

## 8. Time-Locked Permissions

Permissions may be limited by:

- `valid_from_epoch`
- `valid_until_epoch`

Rules:

- expired permissions resolve to `Expired` even before explicit cleanup
- grant and update instructions may not create a policy with `valid_until_epoch < valid_from_epoch`
- cleanup may be lazy, but enforcement must be immediate

## 9. Emergency Freeze Model

Emergency freeze is a wallet-owner control that suspends delegated actions instantly.

Effects when frozen:

- delegated transfer attempts fail
- delegate policy updates fail
- new app sessions fail
- on-chain mutating actions should fail

Suggested freeze state fields:

- `is_frozen`
- `freeze_reason_code`
- `reauth_required_until_epoch`

Unfreeze rules:

- only the owner may unfreeze
- unfreeze should require explicit re-auth flow in the wallet product layer
- unfreeze should emit an audit-log event

## 10. Audit Log Model

Every permission-changing event should be written to an append-only audit log record.

Suggested structure:

```rust
pub struct WalletPermissionAuditLog {
    pub wallet: Pubkey,
    pub sequence: u64,
    pub actor: Pubkey,
    pub target_delegate: Option<Pubkey>,
    pub event_type: AuditEventType,
    pub event_hash: [u8; 32],
    pub event_summary: AuditEventSummary,
    pub created_at_epoch: u64,
    pub created_at_slot: u64,
}
```

Suggested event types:

```rust
pub enum AuditEventType {
    PermissionGranted,
    PermissionUpdated,
    PermissionRevoked,
    SpendLimitUpdated,
    ProgramAllowlistUpdated,
    WalletFrozen,
    WalletUnfrozen,
    DelegateUsageRecorded,
}
```

## 11. Instruction Surface

Minimum on-chain instruction set:

```rust
pub enum WalletPermissionInstruction {
    InitializePermissionAccount {
        owner: Pubkey,
        did: String,
    },
    GrantDelegate {
        delegate: Pubkey,
        role: PermissionRole,
        label: Option<String>,
        valid_from_epoch: u64,
        valid_until_epoch: Option<u64>,
        spend_limit: SpendLimitPolicy,
        program_allowlist: Vec<Pubkey>,
        token_allowlist: Vec<Pubkey>,
        app_scope_hashes: Vec<[u8; 32]>,
        requires_reauth: bool,
    },
    UpdateDelegate {
        delegate: Pubkey,
        role: Option<PermissionRole>,
        label: Option<String>,
        valid_until_epoch: Option<u64>,
        spend_limit: Option<SpendLimitPolicy>,
        program_allowlist: Option<Vec<Pubkey>>,
        token_allowlist: Option<Vec<Pubkey>>,
        app_scope_hashes: Option<Vec<[u8; 32]>>,
        requires_reauth: Option<bool>,
    },
    RevokeDelegate {
        delegate: Pubkey,
    },
    FreezeWallet {
        reason_code: Option<u16>,
        reauth_required_until_epoch: Option<u64>,
    },
    UnfreezeWallet,
    RecordDelegateUsage {
        delegate: Pubkey,
        mint: Option<Pubkey>,
        amount: u64,
        day_index: u64,
    },
    ReadEffectivePermissions {
        delegate: Pubkey,
    },
}
```

## 12. Access Control Rules

- `InitializePermissionAccount` requires the owner signer
- `GrantDelegate` requires the owner signer
- `UpdateDelegate` requires the owner signer
- `RevokeDelegate` requires the owner signer
- `FreezeWallet` requires the owner signer
- `UnfreezeWallet` requires the owner signer plus wallet-layer re-auth proof where applicable
- `RecordDelegateUsage` should only be callable by the wallet permission program itself, a trusted wallet service authority, or a tightly scoped execution path
- `ReadEffectivePermissions` is read-only

## 13. Effective Permission Resolution

When resolving whether an action is allowed:

1. load the `WalletPermissionAccount`
2. reject if the wallet is frozen
3. locate the delegate record
4. reject if missing or not active
5. reject if outside validity window
6. verify role allows the action type
7. verify target program is allowed
8. verify target mint is allowed where relevant
9. verify spend limits against current usage window
10. return the effective decision

## 14. Test Requirements

Ticket 4.2 should not be considered complete until these flows are tested:

- owner grants spender with caps
- spender succeeds under cap
- spender fails over cap
- spender fails after expiry
- viewer cannot submit transfer
- program not on allowlist fails
- owner freezes wallet and delegated actions fail
- owner unfreezes wallet after re-auth and delegated actions recover
- audit log entries are emitted for grant, revoke, freeze, and unfreeze

## 15. Recommended Implementation Order

1. implement permission state structs and serialization
2. implement audit-log state and append semantics
3. implement `InitializePermissionAccount`
4. implement `GrantDelegate`, `UpdateDelegate`, and `RevokeDelegate`
5. implement `FreezeWallet` and `UnfreezeWallet`
6. implement spend-limit accounting and `RecordDelegateUsage`
7. implement `ReadEffectivePermissions`
8. add end-to-end test coverage

## 16. Follow-On Dependencies

This spec feeds:

- wallet permission program/module implementation
- wallet adapter permission prompts
- JS and Node.js SDK permission helpers
- audit and monitoring tooling
