# Phase 3 Task Plan — Permission Layer (Military + FinTech)

## Scope

Phase 3 implements the AEKO Permission Layer: clearance-tiered access control, hybrid encryption,
key lifecycle management, and the five supporting smart contracts. This is the security backbone
that separates AEKO from every other public chain — enabling a single ledger to host both open
social content (L0) and sovereign military communications (L5) simultaneously.

Build order is strict. Do not start a ticket until its dependencies are complete.

1. Foundation — `security-architecture.md`
2. Ticket 3.1 — Permission Engine
3. Ticket 3.2 — Encryption Module
4. Ticket 3.3 — Key Lifecycle Management
5. Smart Contracts (in dependency order)

---

## What Already Exists

| Component | Location | Status |
| --- | --- | --- |
| Delegate / wallet permissions | `programs/wallet-permissions/` | Complete — Owner/Spender/Viewer roles, spend limits, audit log, freeze |
| Anti-spam gating | `programs/social-anti-spam/` | Complete — cooldown, reputation, stake gating |
| Permission layer docs | `docs/permission-layer/` | Overview, encryption model, identity & clearance, fintech security, key rotation, military communication |

Phase 3 builds *on top of* these. The existing `wallet-permissions` program handles **who can act
as a delegate**. Phase 3 adds **what clearance level a principal holds**, **which subnet they may
enter**, and **how their payloads are encrypted in transit and at rest**.

---

## Foundation — Security Architecture Document

**Blocking milestone** for all three tickets and all five contracts.

### Objective

Produce `docs/permission-layer/security-architecture.md` — the single authoritative specification
that all Phase 3 code implements. Nothing is coded until this document is signed off.

### Required Sections

- Clearance tier definitions (L0–L5) with precise entry criteria, issuer types, and SBT schema
- Role registry schema: role ID, owning authority, allowed clearance range, subnet bindings
- Access policy evaluation order: clearance check → role check → subnet check → payload decrypt
- Encrypted transaction payload envelope format (header, ciphertext, MAC, key ID)
- Permissioned subnet isolation model: how subnet IDs map to validator sets and ACL programs
- ECDH key exchange protocol (X25519), AES-256-GCM encryption parameters
- ECIES envelope format for social privacy use cases
- Forward secrecy mechanism: per-session ephemeral keys, ratchet cadence
- Key lifecycle states: Active, PendingRotation, Rotated, Revoked, Compromised
- Rotation ceremony: intent → approval quorum → old key revocation → propagation
- Emergency zone freeze: trigger authority (multisig), scope (subnet), propagation path
- SGX enclave execution contract for L5 transactions
- Post-quantum signing plan: Dilithium / Falcon for L5 zones, migration path for L1–L4
- FinTech controls alignment: PCI-DSS, ISO 27001, SOC 2 mapping per clearance tier

### Acceptance Criteria

- Document is internally consistent — no ambiguous terms
- Every data structure needed by Tickets 3.1–3.3 is fully specified
- Key ID format, SBT account layout, and subnet ID encoding are concretely defined
- Signed off before any contract code is written

---

## Ticket 3.1 — Permission Engine

**Depends on:** signed-off `security-architecture.md`

### Objective

Implement the on-chain clearance system, role registry, and access policy evaluator. Every
transaction on AEKO must pass through this engine before reaching the SVM executor.

### Tasks

#### 3.1.1 — Clearance System

- Define `ClearanceTier` enum: `L0 | L1 | L2 | L3 | L4 | L5` in a shared `permission-types` crate
- Define `ClearanceSbt` account schema:
  - `holder: Pubkey`
  - `tier: ClearanceTier`
  - `issuer: Pubkey`
  - `issued_at_slot: u64`
  - `valid_until_slot: Option<u64>`
  - `revocation_registry: Pubkey` — pointer to the on-chain revocation list
- Implement `verify_clearance(holder, required_tier, current_slot)` — checks SBT exists, is not
  expired, and is not listed in the revocation registry
- Wire `verify_clearance` into the `permission-registry` program's `CheckAccess` instruction

#### 3.1.2 — Role Registry

- Define `RoleEntry` account schema:
  - `role_id: [u8; 32]`
  - `authority: Pubkey`
  - `min_clearance: ClearanceTier`
  - `max_clearance: ClearanceTier`
  - `subnet_bindings: Vec<[u8; 32]>` — subnet IDs this role may enter
  - `created_at_slot: u64`
  - `is_active: bool`
- Implement `RegisterRole` instruction (authority-gated)
- Implement `DeactivateRole` instruction (authority-gated)
- Implement `AssignRole(wallet, role_id)` — requires caller clearance >= role's `min_clearance`
- Implement `RevokeRole(wallet, role_id)`

#### 3.1.3 — Access Policy Evaluator

- Implement the policy evaluation chain in order:
  1. Clearance check: `holder.tier >= required_tier`
  2. Role check: wallet holds an active role that includes the target subnet
  3. Subnet check: wallet is not banned from the subnet (see `subnet-registry`)
  4. Return `AccessGranted` or `AccessDenied(reason_code)`
- Expose as a CPI-callable instruction `EvaluateAccess` so other programs can call it without
  duplicating logic
- Add `DenyByDefault` policy at L3+: absence of an explicit role grant is a deny

#### 3.1.4 — Encrypted Transaction Payload Support

- Define the encrypted payload envelope format per `security-architecture.md`
- Add `DecryptHeader` instruction: validates MAC, identifies key ID, delegates decryption to the
  Encryption Module (Ticket 3.2)
- For L5 payloads: header is opaque to validators outside the SGX enclave path; validator must
  forward to enclave worker

#### 3.1.5 — Permissioned Subnet Enforcement

- Add subnet membership check to the transaction pre-execution hook in
  `runtime/src/bank.rs` — if transaction targets a permissioned subnet, call `EvaluateAccess`
  before dispatching to the SVM
- Subnet ID encoding: derive from `subnet-registry` account PDA

### Acceptance Criteria

- `verify_clearance` rejects expired and revoked SBTs
- `EvaluateAccess` CPI works from social-posts and wallet-permissions programs
- L0 transactions are unaffected (no overhead for public zone)
- L3+ DenyByDefault policy is enforced and tested
- Encrypted payload envelope round-trips correctly (encrypt → store → DecryptHeader → plaintext)

---

## Ticket 3.2 — Encryption Module

**Depends on:** Ticket 3.1 (clearance system and key ID format must be settled)

### Objective

Implement the cryptographic primitives and on-chain key management that the Permission Engine
invokes. This is a Rust crate (`encryption-module`) callable by programs and by the validator
node process.

### Tasks

#### 3.2.1 — ECDH Key Exchange (X25519)

- Implement `ecdh_shared_secret(my_privkey: &[u8; 32], their_pubkey: &[u8; 32]) -> [u8; 32]`
  using the `x25519-dalek` crate (already available via `zk-token-sdk` dependencies)
- Derive session key: `HKDF-SHA256(shared_secret, salt=key_id, info=b"aeko-session-v1")`
- Store ephemeral public keys on-chain in `subnet-registry` session records

#### 3.2.2 — AES-256-GCM Symmetric Encryption

- Implement `aes_gcm_encrypt(key: &[u8; 32], nonce: &[u8; 12], plaintext: &[u8], aad: &[u8]) -> Vec<u8>`
- Implement `aes_gcm_decrypt(key: &[u8; 32], nonce: &[u8; 12], ciphertext: &[u8], aad: &[u8]) -> Result<Vec<u8>>`
- Nonce generation: 96-bit random for first message, then counter mode for subsequent messages in
  a session (prevent nonce reuse)
- Use `aes-gcm` crate — add to workspace `Cargo.toml`

#### 3.2.3 — ECIES Hybrid Envelope (Social Privacy)

- Implement `ecies_encrypt(recipient_pubkey: &[u8; 33], plaintext: &[u8]) -> EciesEnvelope`
  - Generate ephemeral keypair
  - ECDH → session key
  - AES-256-GCM encrypt plaintext
  - Envelope: `{ ephemeral_pubkey, ciphertext, nonce, tag }`
- Implement `ecies_decrypt(recipient_privkey: &[u8; 32], envelope: &EciesEnvelope) -> Result<Vec<u8>>`
- Used for: social DMs, private post content, L2–L3 credential payloads

#### 3.2.4 — Forward Secrecy

- Implement a Double Ratchet-lite protocol for persistent channels:
  - Root key + chain key derived from initial ECDH
  - Each message advances the chain key: `chain_key = HMAC-SHA256(chain_key, 0x01)`
  - Message key: `HMAC-SHA256(chain_key, 0x02)`
  - Ratchet step on each reply: new ECDH exchange, derive new root key
- On-chain ratchet state stored in `subnet-registry` channel records (encrypted with current
  session key)

#### 3.2.5 — FinTech Controls

- Enforce AES-256-GCM (minimum 256-bit keys) for all L3+ transaction payloads
- Add `KeyStrengthCheck` that rejects key material shorter than 256 bits at the program boundary
- Add audit log entries (reuse `WalletPermissionAuditLogEntry` pattern) for every encrypt /
  decrypt operation at L3+
- TLS 1.3 requirement for RPC connections to L3+ subnets: add validator-side check in
  `rpc/src/rpc.rs` that refuses non-TLS connections when serving a permissioned subnet

#### 3.2.6 — Encrypted Channel Between Nodes

- Implement `NodeChannel` in `gossip/src/` that wraps `ClusterInfo` gossip messages in AES-256-GCM
  for L3+ subnet peers
- Key negotiation: both nodes do ECDH using their validator identity keys at connection setup
- Channel rekey: every 10,000 messages or 1 epoch, whichever comes first

### Acceptance Criteria

- ECDH → AES-256-GCM round-trip produces identical plaintext
- ECIES encrypt/decrypt round-trips with a randomly generated recipient keypair
- Forward secrecy: compromising message key N does not expose message key N-1
- FinTech: all L3+ operations log to the audit chain
- `KeyStrengthCheck` rejects 128-bit and 192-bit keys
- Node channel rekeys without dropping messages

---

## Ticket 3.3 — Key Lifecycle Management

**Depends on:** Ticket 3.2 (encryption primitives must exist before key state machine is wired up)

### Tasks

#### 3.3.1 — Key State Machine

- Define `KeyRecord` in `revocation-registry`:
  - `key_id: [u8; 32]`
  - `owner: Pubkey`
  - `key_type: KeyType` — `SessionKey | RotationKey | NodeKey | HardwareKey`
  - `public_key_bytes: Vec<u8>`
  - `state: KeyState` — `Active | PendingRotation | Rotated | Revoked | Compromised`
  - `created_at_slot: u64`
  - `expires_at_slot: Option<u64>`
  - `successor_key_id: Option<[u8; 32]>`
- Implement state transitions:
  - `Active → PendingRotation` (scheduled rotation intent)
  - `PendingRotation → Rotated` (after quorum approval)
  - `Active → Revoked` (authority or multisig)
  - `Active → Compromised` (emergency — bypasses normal approval flow)

#### 3.3.2 — Scheduled Key Rotation

- Implement `InitiateRotation(key_id, new_public_key)` instruction
  - Creates a `RotationIntent` record with the proposed successor key
  - Emits event for approvers to pick up
- Implement `ApproveRotation(rotation_intent_id)` instruction
  - Requires M-of-N approvers defined in the key's `RotationPolicy`
  - Once quorum reached: sets old key to `Rotated`, activates successor key
- Scheduled rotation triggers: at `expires_at_slot` approach (within 1 epoch), validator
  automatically emits `InitiateRotation` for its own node keys

#### 3.3.3 — Emergency Revocation

- Implement `EmergencyRevoke(key_id, reason_code)` in `emergency-multisig` program
  - Bypasses rotation approval flow
  - Immediately sets key to `Compromised`
  - Triggers propagation to subnet-registry, gossip layer, RPC
- Propagation path:
  1. `revocation-registry` account updated
  2. `subnet-registry` bans the key's associated wallet from all subnets
  3. Gossip CrdsValue `KeyRevocation` pushed to all peers
  4. RPC layer reads revocation registry before serving any request authenticated by revoked key

#### 3.3.4 — Hardware Wallet Integration

- Add `HardwareKeyRecord` variant: stores the public key only (private key never leaves device)
- Add `HardwareSignatureVerification` instruction that accepts a signature + nonce and verifies
  against the stored hardware public key
- Support Ledger and Trezor via existing `remote-wallet` crate — wire revocation check into
  `remote-wallet/src/remote_keypair.rs` so a revoked hardware key is immediately rejected

#### 3.3.5 — Node-to-Node Key Management

- Validator identity key registered in `revocation-registry` at startup
- Key rotation for validator nodes: triggered by `InitiateRotation`, approved by the validator's
  own admin multisig
- After rotation: new key announced via gossip `NodeKeyRotation` CrdsValue
- Peers update their `NodeChannel` session keys upon receiving `NodeKeyRotation`

### Acceptance Criteria

- Key state machine rejects invalid transitions (e.g., `Rotated → Active`)
- Scheduled rotation completes after quorum approval and activates successor key
- `EmergencyRevoke` propagates to gossip within one slot
- Hardware key verification rejects a revoked key immediately
- Node channel renegotiates session after `NodeKeyRotation` gossip message

---

## Smart Contracts — Build Order

All five contracts live under `programs/`. Build in strict dependency order.

### Contract 1 — `permission-registry`

**Depends on:** `security-architecture.md` signed off

**Location:** `programs/permission-registry/`

This is the foundation. Every other contract calls into it.

- Instructions: `IssueClearance`, `RevokeClearance`, `CheckAccess`, `EvaluateAccess` (CPI),
  `RegisterRole`, `DeactivateRole`, `AssignRole`, `RevokeRole`
- State accounts: `ClearanceSbt`, `RoleEntry`, `WalletRoleAssignment`
- The `IssueClearance` instruction must be gated: only authorities whitelisted per tier may issue
  - L1–L2: any KYC provider in the issuer registry
  - L3: corporate authority
  - L4: government authority
  - L5: sovereign / military authority
- Add to workspace `Cargo.toml` and `programs/permission-registry/Cargo.toml`

**Acceptance Criteria:**
- `IssueClearance` rejects issuers not whitelisted for that tier
- `CheckAccess` returns correct result for expired, revoked, and valid SBTs
- `EvaluateAccess` CPI callable from `social-posts` and `wallet-permissions` without error

---

### Contract 2 — `revocation-registry`

**Depends on:** `permission-registry`

**Location:** `programs/revocation-registry/`

Central ledger of all revoked / compromised keys and credentials.

- Instructions: `RegisterKey`, `InitiateRotation`, `ApproveRotation`, `RevokeKey`,
  `MarkCompromised`, `IsRevoked` (read-only CPI)
- State accounts: `KeyRecord`, `RotationIntent`, `RotationApproval`
- `IsRevoked` must be callable as a zero-cost read from any program

**Acceptance Criteria:**
- `IsRevoked` returns true immediately after `RevokeKey`
- Rotation quorum is enforced — approval below threshold does not activate successor
- `MarkCompromised` bypasses quorum and takes effect in the same slot

---

### Contract 3 — `subnet-registry`

**Depends on:** `permission-registry`, `revocation-registry`

**Location:** `programs/subnet-registry/`

Manages the lifecycle of permissioned subnets and their membership rules.

- Instructions: `CreateSubnet`, `AddSubnetMember`, `RemoveSubnetMember`, `FreezeSubnet`,
  `UnfreezeSubnet`, `CheckSubnetAccess`
- State accounts: `SubnetRecord`, `SubnetMembership`, `SubnetChannelSession`
- `SubnetRecord` fields:
  - `subnet_id: [u8; 32]`
  - `owner: Pubkey`
  - `min_clearance: ClearanceTier`
  - `is_frozen: bool`
  - `freeze_reason_code: Option<u16>`
  - `validator_set: Vec<Pubkey>`
- On `FreezeSubnet`: all pending transactions targeting this subnet are halted by the
  pre-execution hook in `runtime/src/bank.rs`
- On `RemoveSubnetMember`: calls `revocation-registry` `IsRevoked` to confirm key is still valid
  before re-adding (prevent bounced revocations)

**Acceptance Criteria:**
- `CreateSubnet` requires `min_clearance >= L3` for restricted zones
- Frozen subnet rejects all new transactions within one slot
- Member with a revoked key cannot be re-added without a new valid key

---

### Contract 4 — `emergency-multisig`

**Depends on:** `permission-registry`, `subnet-registry`, `revocation-registry`

**Location:** `programs/emergency-multisig/`

The kill switch. Authorizes zone freezes and emergency key revocations.

- Instructions: `InitializeMultisig`, `ProposeAction`, `ApproveAction`, `ExecuteAction`,
  `CancelAction`
- `ProposedAction` enum:
  - `FreezeSubnet { subnet_id, reason_code }`
  - `UnfreezeSubnet { subnet_id }`
  - `EmergencyRevokeKey { key_id, reason_code }`
  - `UpgradeClearancePolicy { tier, new_policy_hash }`
- Quorum configuration: M-of-N per action type, stored in `MultisigConfig`
- `ExecuteAction` CPIs into `subnet-registry` or `revocation-registry` depending on action type
- Execution is time-bounded: unexecuted proposals expire after `proposal_ttl_slots`
- Separate quorum thresholds per action severity (e.g., `FreezeSubnet` requires 3-of-5,
  `EmergencyRevokeKey` requires 4-of-5)

**Acceptance Criteria:**
- `ExecuteAction(FreezeSubnet)` freezes the subnet within the same slot
- Below-quorum proposals cannot execute
- Expired proposals are rejected
- CPI into `subnet-registry` succeeds with proper authority derivation

---

### Contract 5 — `finality-oracle`

**Depends on:** all four contracts above

**Location:** `programs/finality-oracle/`

Issues clearance-gated finality proofs. External systems (bridges, compliance auditors) call this
to verify that a transaction was finalized within a specific permission context.

- Instructions: `RequestFinalityProof`, `IssueFinalityProof`, `VerifyFinalityProof`
- `FinalityProof` fields:
  - `slot: u64`
  - `transaction_signature: [u8; 64]`
  - `clearance_tier: ClearanceTier`
  - `subnet_id: Option<[u8; 32]>`
  - `issued_by: Pubkey`
  - `issued_at_slot: u64`
  - `proof_hash: [u8; 32]` — blake3 of the above fields
- `IssueFinalityProof`: only callable by validators that hold a valid clearance for the proof's
  tier and are members of the relevant subnet
- `VerifyFinalityProof`: public read — verifies proof_hash, checks issuer clearance is not
  revoked, checks issuer is still a subnet member

**Acceptance Criteria:**
- Proof issued by a validator with L3 clearance verifies successfully
- Proof issued by a validator whose key was subsequently revoked fails `VerifyFinalityProof`
- `RequestFinalityProof` for an L5 transaction requires L5 clearance from the requester

---

## Execution Checklist

### Foundation

- [x] Draft `docs/permission-layer/security-architecture.md`
- [x] Define clearance tier entry criteria and SBT schema
- [x] Define encrypted payload envelope format
- [x] Define key ID format and key lifecycle states
- [x] Define subnet ID encoding and isolation model
- [x] Sign off `security-architecture.md` before writing any contract code

### Ticket 3.1 — Permission Engine

- [x] Add `permission-types` crate with `ClearanceTier`, `ClearanceSbt`, `RoleEntry`
- [x] Implement `verify_clearance`
- [x] Implement `EvaluateAccess` (clearance → role → subnet chain)
- [x] Implement `DecryptHeader` instruction
- [x] Wire subnet check into `runtime/src/bank.rs` pre-execution hook
- [x] Test: L0 tx passes through without overhead
- [x] Test: L3 tx denied when wallet has no role
- [x] Test: expired SBT rejected

### Ticket 3.2 — Encryption Module

- [x] Add `aes-gcm` and `x25519-dalek` to workspace `Cargo.toml`
- [x] Implement `ecdh_shared_secret` + HKDF session key derivation
- [x] Implement `aes_gcm_encrypt` / `aes_gcm_decrypt` with nonce strategy
- [x] Implement `ecies_encrypt` / `ecies_decrypt`
- [x] Implement forward secrecy ratchet
- [x] Add `KeyStrengthCheck`
- [x] Add encryption audit log entries for L3+
- [x] Implement `NodeChannel` in gossip layer
- [x] Test: AES-256-GCM round-trip
- [x] Test: ECIES round-trip
- [x] Test: forward secrecy — N-1 key not derivable from N
- [x] Test: `KeyStrengthCheck` rejects sub-256-bit keys

### Ticket 3.3 — Key Lifecycle

- [x] Define `KeyRecord` and `RotationIntent` state structs
- [x] Implement key state machine with transition guards
- [x] Implement `InitiateRotation` / `ApproveRotation`
- [x] Implement `EmergencyRevoke` with gossip propagation
- [x] Wire hardware key verification into `remote-wallet`
- [x] Implement `NodeKeyRotation` CrdsValue and channel renegotiation
- [x] Test: state machine rejects invalid transitions
- [x] Test: rotation requires quorum
- [x] Test: `EmergencyRevoke` propagates to gossip within one slot

### Smart Contracts

- [x] Scaffold `programs/permission-registry/` (Cargo.toml, lib.rs, error.rs, state.rs, instruction.rs, processor.rs)
- [x] Implement all `permission-registry` instructions
- [x] Test `permission-registry`: issuance, clearance check, role management
- [x] Scaffold `programs/revocation-registry/`
- [x] Implement all `revocation-registry` instructions
- [x] Test `revocation-registry`: rotation quorum, emergency revoke, `IsRevoked` CPI
- [x] Scaffold `programs/subnet-registry/`
- [x] Implement all `subnet-registry` instructions
- [x] Test `subnet-registry`: freeze/unfreeze, membership, clearance enforcement
- [x] Scaffold `programs/emergency-multisig/`
- [x] Implement all `emergency-multisig` instructions
- [x] Test `emergency-multisig`: quorum, expiry, CPI into subnet + revocation registries
- [x] Scaffold `programs/finality-oracle/`
- [x] Implement all `finality-oracle` instructions
- [x] Test `finality-oracle`: proof issuance, verification, revoked issuer rejection

---

## Notes

- Do not touch `programs/wallet-permissions/` during Phase 3. That program is stable. Phase 3
  calls *into* it via CPI when evaluating delegate clearance; it does not replace it.
- L0 transactions must have zero Phase 3 overhead. All clearance checks are gated on the
  transaction's target subnet being registered in `subnet-registry`.
- Post-quantum signing (Dilithium/Falcon) for L5 zones is a Phase 3 stretch goal. Plan the key
  schema to be algorithm-agnostic (`key_algorithm: KeyAlgorithm` field in `KeyRecord`) so it can
  be added without a breaking change.
- SGX enclave execution for L5 is a validator infrastructure change, not a program change. Flag
  the L5 decryption path in the `DecryptHeader` instruction with a `RequiresEnclave` error so
  non-enclave validators refuse L5 transactions cleanly rather than silently mishandling them.
