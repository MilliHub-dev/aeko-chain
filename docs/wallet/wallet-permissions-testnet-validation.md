# Wallet Permissions Testnet Validation

This document defines the live validation flow required to close Ticket 4.2 for Phase 4.

It should be used together with:

- [`docs/wallet/permission-controls-spec.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/permission-controls-spec.md)
- [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md)

## Goal

Prove that the wallet-permissions implementation works end to end on AEKO testnet for:

- permission state initialization
- delegate grant
- delegate update
- delegate revoke
- effective permission reads
- spend-limit enforcement
- allowlist enforcement
- time-lock enforcement
- emergency freeze and unfreeze
- audit-log recording

## Environment

Recommended baseline:

- testnet RPC: `https://api.testnet.aeko.chain`
- funded owner wallet
- delegate wallet or session key
- known program id to use for allowlist checks

## Validation Steps

Helpful starting point:

- [`wallet-core/examples/permission_validation.rs`](/Users/ok/Documents/projects/aeko-chain/wallet-core/examples/permission_validation.rs)
- [`docs/wallet/phase4-validation-commands.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-validation-commands.md)

### 1. Initialize Permission State

Verify:

- permission state account is created or initialized
- audit-log account is created or initialized
- DID and wallet anchor fields match expectations

Record:

- permission state address
- audit log address
- initialization tx signature

### 2. Grant Delegate

Verify:

- delegate grant succeeds
- assigned role is correct
- spend limits and allowlists persist as expected
- grant event appears in the audit log

Record:

- delegate pubkey
- grant tx signature

### 3. Effective Permission Read

Verify:

- effective permissions can be resolved deterministically
- the returned role, status, and allowlists match the granted policy

Record:

- read method used
- verification output note

### 4. Spend-Limit Enforcement

Verify:

- a usage record within limits succeeds
- a usage record above the configured cap fails

Record:

- successful usage tx signature
- rejection note for over-cap attempt

### 5. Program and Token Allowlist Enforcement

Verify:

- allowed program usage succeeds
- disallowed program usage fails
- disallowed token usage fails where applicable

Record:

- allowed usage tx signature
- rejection note for disallowed usage

### 6. Time-Lock Enforcement

Verify:

- permissions before `valid_from_epoch` are inactive
- permissions after `valid_until_epoch` are inactive

Record:

- epoch values used
- effective permission read output note

### 7. Delegate Update and Revoke

Verify:

- delegate update succeeds
- updated policy is reflected in effective reads
- revoke succeeds
- revoked delegate can no longer act

Record:

- update tx signature
- revoke tx signature

### 8. Freeze and Unfreeze

Verify:

- freeze blocks delegated actions immediately
- unfreeze restores delegated actions according to policy
- both actions append audit-log entries

Record:

- freeze tx signature
- unfreeze tx signature

## Acceptance Criteria

Wallet permissions validation is complete when:

- state initialization succeeds on testnet
- grant, update, revoke, freeze, and unfreeze all succeed
- over-cap and disallowed usage fail predictably
- effective permission reads match policy state
- audit-log writes are visible for key actions
- final verification values are recorded in [`docs/wallet/phase4-closeout-record.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/phase4-closeout-record.md)

## Output To Record

Add the following to the Phase 4 closeout record:

- wallet-permissions testnet validation date
- permission state verification tx
- audit-log verification tx
- freeze / unfreeze verification tx
- notes for over-cap and disallowed-usage rejection behavior
