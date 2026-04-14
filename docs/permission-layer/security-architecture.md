# AEKO Permission Layer — Security Architecture

This document is the authoritative specification for Phase 3. All implementation in
`programs/permission-registry`, `programs/revocation-registry`, `programs/subnet-registry`,
`programs/emergency-multisig`, `programs/finality-oracle`, and the Encryption Module must
conform to exactly what is defined here. Do not write contract code before this document is
signed off.

---

## 1. Clearance Tier Definitions

AEKO uses six clearance tiers. Every wallet on the network operates at exactly one tier at any
given time. Tier membership is proven by a **Clearance SBT** (Soulbound Token) held in the
wallet account and issued by an approved Identity Provider.

| Tier | Name | Entry Criteria | Issuer Type |
| :--- | :--- | :--- | :--- |
| L0 | Public / Anon | Wallet exists | None — implicit |
| L1 | Verified Human | Proof-of-Humanity (biometric or social graph) | WorldID, Clear, or equivalent PoH provider |
| L2 | KYC / Financial | Government ID verification | Bank, regulated fintech, KYC bureau |
| L3 | Enterprise | Corporate credential (LDAP/SAML assertion) | Corporate IdP registered with the chain |
| L4 | Government | Sovereign identity assertion | Government IdP, e.g. national e-ID authority |
| L5 | Military / Top Secret | Hardware-bound key (YubiKey or equivalent) + biometric | Sovereign/military authority — sole issuer per subnet |

Rules:
- A wallet may hold at most one active SBT per tier. Higher tiers do not imply lower tiers —
  each tier is independently issued.
- Clearance grants access up to and including the issued tier. A program requiring L2 accepts
  wallets holding an active L2, L3, L4, or L5 SBT.
- Clearance does **not** grant subnet membership. A separate role assignment is required.

### 1.1 Clearance SBT Account Schema

PDA seed: `[b"clearance", wallet_pubkey, &[tier as u8]]`

```
ClearanceSbt {
    holder:               Pubkey,       // wallet this SBT is bound to
    tier:                 ClearanceTier, // L0–L5 (L0 is implicit, never stored)
    issuer:               Pubkey,       // issuer authority pubkey
    issued_at_slot:       u64,
    valid_until_slot:     Option<u64>,  // None = no expiry
    revocation_registry:  Pubkey,       // the revocation-registry program account to query
    is_active:            bool,
}
```

L0 is implicit — no SBT is stored for L0 wallets. Any wallet without an L1+ SBT is treated as L0.

### 1.2 Issuer Registry

Before an authority may issue SBTs for a tier, it must be registered in the
`permission-registry` program's `IssuerRecord` account.

```
IssuerRecord {
    authority:   Pubkey,
    tier:        ClearanceTier,
    label:       String,        // human-readable name, max 64 chars
    is_active:   bool,
    registered_at_slot: u64,
}
```

PDA seed: `[b"issuer", authority_pubkey, &[tier as u8]]`

Only the `permission-registry` upgrade authority may register or deactivate issuers.

---

## 2. Role Registry Schema

Roles are named capabilities that bind a wallet to one or more subnets and define the clearance
range required to hold that role.

```
RoleEntry {
    role_id:         [u8; 32],          // SHA-256 of (authority || label)
    authority:       Pubkey,            // who controls this role definition
    label:           String,            // max 64 chars
    min_clearance:   ClearanceTier,
    max_clearance:   ClearanceTier,
    subnet_bindings: Vec<[u8; 32]>,     // subnet_ids this role grants access to
    created_at_slot: u64,
    is_active:       bool,
}
```

PDA seed: `[b"role", role_id]`

```
WalletRoleAssignment {
    wallet:          Pubkey,
    role_id:         [u8; 32],
    assigned_at_slot: u64,
    assigned_by:     Pubkey,
    is_active:       bool,
}
```

PDA seed: `[b"role-assign", wallet_pubkey, role_id]`

---

## 3. Access Policy Evaluation Order

Every transaction targeting a permissioned subnet (L1+) passes through this chain before
reaching the SVM executor. Each step must pass; failure at any step returns `AccessDenied` with
a reason code. L0 transactions bypass the chain entirely.

```
1. Clearance Check
   - Load ClearanceSbt PDA for (wallet, required_tier)
   - Verify is_active == true
   - If valid_until_slot is set: verify current_slot <= valid_until_slot
   - Call revocation-registry IsRevoked(sbt_key_id) — must return false
   → Fail: ClearanceMissing | ClearanceExpired | ClearanceRevoked

2. Role Check
   - Load WalletRoleAssignment PDA for (wallet, required_role_id)
   - Verify is_active == true
   - Verify role.min_clearance <= wallet_tier <= role.max_clearance
   → Fail: RoleMissing | RoleInactive | ClearanceOutOfRange

3. Subnet Check
   - Load SubnetRecord PDA for subnet_id
   - Verify is_frozen == false
   - Verify wallet is a member (SubnetMembership PDA exists and is_active)
   → Fail: SubnetFrozen | SubnetMembershipMissing

4. DenyByDefault at L3+
   - If required_tier >= L3 and no explicit role grant passed steps 1-3: deny
   → Fail: DenyByDefault

5. AccessGranted
```

The evaluator is exposed as a CPI instruction `EvaluateAccess` so any program can call it
without duplicating this logic.

---

## 4. Encrypted Transaction Payload Envelope

Transactions targeting L3+ subnets carry an encrypted payload. The envelope wraps the
instruction data field.

### 4.1 Envelope Format

```
EncryptedPayloadEnvelope {
    version:     u8,         // 0x01
    tier:        u8,         // clearance tier this payload is encrypted for
    key_id:      [u8; 32],   // identifies which session key was used
    nonce:       [u8; 12],   // AES-256-GCM nonce
    ciphertext:  Vec<u8>,    // AES-256-GCM ciphertext
    tag:         [u8; 16],   // AES-256-GCM authentication tag
    aad:         [u8; 64],   // additional authenticated data:
                             //   [0..32]  = transaction signature
                             //   [32..64] = subnet_id
}
```

Total overhead: 1 + 1 + 32 + 12 + 16 + 64 = 126 bytes fixed, plus ciphertext length.

### 4.2 Key ID Format

```
key_id = SHA-256(key_type_byte || owner_pubkey || created_at_slot_le_bytes)
```

`key_type_byte`: `0x01` = SessionKey, `0x02` = RotationKey, `0x03` = NodeKey, `0x04` = HardwareKey

### 4.3 L5 Enclave Path

For L5 payloads, validators without SGX capability must return `RequiresEnclave` error rather
than attempting decryption. The enclave worker decrypts inside the CPU boundary, executes the
instruction, and re-encrypts the resulting state delta before writing to the ledger. The public
ledger records the transaction signature and slot but the instruction data remains opaque.

### 4.4 DecryptHeader Instruction

The `permission-registry` program exposes `DecryptHeader`:
- Validates the AAD (transaction signature matches the calling transaction, subnet_id matches)
- Verifies the key_id exists in `revocation-registry` and is not revoked
- Returns the session key reference to the caller (does not return raw key material over CPI —
  the actual decryption happens in the calling program's execution context using the
  Encryption Module)

---

## 5. Permissioned Subnet Isolation Model

Subnets are isolated execution zones. A subnet is identified by a `subnet_id` which is the
SHA-256 of `(owner_pubkey || label_bytes)`.

### 5.1 Subnet ID Derivation

```
subnet_id = SHA-256(owner_pubkey || label.as_bytes())
```

### 5.2 Validator Set Isolation

Each subnet specifies a `validator_set: Vec<Pubkey>`. Transactions targeting a subnet are only
processed by validators in that set. Non-member validators forward the transaction but do not
execute it. This is enforced at the `runtime/src/bank.rs` pre-execution hook.

### 5.3 ACL Program Binding

`SubnetRecord.acl_program: Pubkey` — optional custom ACL program that is called after the
standard `EvaluateAccess` chain. If set, this program's `CheckAccess` instruction must also
return `AccessGranted` before execution proceeds.

### 5.4 Freeze Semantics

When a subnet is frozen:
- All new transactions targeting the subnet are rejected at the pre-execution hook with
  `SubnetFrozen` error code
- In-flight transactions that have already passed the hook but not yet committed are allowed to
  complete (they were evaluated before the freeze)
- The freeze state is propagated via gossip `SubnetFreeze` CrdsValue within one slot

---

## 6. ECDH Key Exchange Protocol

All session key establishment uses **X25519 Diffie-Hellman** followed by **HKDF-SHA256** key
derivation.

### 6.1 Key Exchange Steps

```
1. Party A generates ephemeral keypair: (a_priv, a_pub)
2. Party B generates ephemeral keypair: (b_priv, b_pub)
3. Shared secret: shared = X25519(a_priv, b_pub) == X25519(b_priv, a_pub)
4. Session key: HKDF-SHA256(
       ikm  = shared,
       salt = key_id,         // 32 bytes
       info = b"aeko-session-v1",
       len  = 32
   )
```

### 6.2 AES-256-GCM Encryption Parameters

- Key: 256-bit (32 bytes), derived from HKDF above
- Nonce: 96-bit (12 bytes)
  - First message: randomly generated, stored in envelope
  - Subsequent messages in a session: counter mode, `nonce = initial_nonce XOR counter_le`
  - Counter is a monotonically increasing u64, reset on session rekey
- Tag: 128-bit (16 bytes), appended to ciphertext
- AAD: always set — minimum is the transaction signature (32 bytes)
- Nonce reuse is a fatal error: if the counter wraps to zero, the session must be rekeyed before
  any further messages

### 6.3 Rejected Configurations

The `KeyStrengthCheck` enforcer rejects the following at the program boundary:
- Keys shorter than 256 bits
- Nonces shorter than 96 bits
- AES-128 or AES-192 (only AES-256 accepted)
- RC4, DES, 3DES, or any stream cipher

---

## 7. ECIES Envelope Format (Social Privacy)

Used for: private DMs (L1+), "Friends Only" posts (L1+), L2–L3 credential payloads.

```
EciesEnvelope {
    version:          u8,        // 0x01
    ephemeral_pubkey: [u8; 33],  // compressed secp256k1 or ed25519 public key
    nonce:            [u8; 12],  // AES-256-GCM nonce
    ciphertext:       Vec<u8>,
    tag:              [u8; 16],
}
```

Encryption:
1. Sender generates ephemeral keypair
2. ECDH with recipient's stored public key → shared secret
3. HKDF-SHA256(shared_secret, salt=b"ecies-v1", info=recipient_pubkey, len=32) → aes_key
4. AES-256-GCM encrypt plaintext using aes_key

Decryption:
1. Recipient ECDH with ephemeral_pubkey using their private key → shared secret
2. Same HKDF derivation → aes_key
3. AES-256-GCM decrypt

The encrypted blob is stored on IPFS. Only the `EciesEnvelope` header fields are stored
on-chain (content hash + envelope header pointer).

---

## 8. Forward Secrecy Mechanism

For persistent channels (e.g., recurring settlement channels between enterprise nodes on L3+),
AEKO uses a Double Ratchet-lite protocol.

### 8.1 Initial Setup

```
root_key    = HKDF-SHA256(ecdh_shared_secret, salt=b"root-v1", len=32)
send_chain  = HKDF-SHA256(root_key, salt=b"send-chain", len=32)
recv_chain  = HKDF-SHA256(root_key, salt=b"recv-chain", len=32)
```

### 8.2 Message Key Derivation

```
msg_key    = HMAC-SHA256(send_chain, b"\x02")   // message key
send_chain = HMAC-SHA256(send_chain, b"\x01")   // advance chain
```

Deleting `msg_key` after use means past messages cannot be decrypted even if the current
`send_chain` is compromised.

### 8.3 Ratchet Step (on each reply)

```
new_ecdh       = X25519(my_new_ephemeral_priv, their_new_ratchet_pub)
root_key       = HKDF-SHA256(new_ecdh, salt=root_key, len=32)
send_chain     = HKDF-SHA256(root_key, salt=b"send-chain", len=32)
```

The new ephemeral public key is included in the message header so the receiver can perform the
matching ratchet step.

### 8.4 Ratchet Cadence

- Symmetric ratchet: every message
- ECDH ratchet: every reply (alternating send/receive)
- Maximum messages before forced ECDH ratchet: 1,000
- On-chain ratchet state is stored encrypted in `SubnetChannelSession` (AES-256-GCM with the
  current session key)

---

## 9. Key Lifecycle States

```
Active
  │
  ├─→ PendingRotation   (scheduled rotation initiated)
  │       │
  │       └─→ Rotated   (quorum approved, successor activated)
  │
  ├─→ Revoked           (normal revocation by authority)
  │
  └─→ Compromised       (emergency — bypasses quorum, same-slot effect)
```

State transition rules:
- `Active → PendingRotation`: requires `InitiateRotation` signed by key owner
- `PendingRotation → Rotated`: requires M-of-N quorum approval (M and N defined in `RotationPolicy`)
- `Active → Revoked`: requires revocation authority signature
- `Active → Compromised`: requires `emergency-multisig` quorum (higher threshold than normal)
- All other transitions are rejected with `InvalidKeyStateTransition`
- `Rotated`, `Revoked`, and `Compromised` are terminal — no further transitions allowed

### 9.1 Key Record Schema

```
KeyRecord {
    key_id:           [u8; 32],
    owner:            Pubkey,
    key_type:         KeyType,     // SessionKey | RotationKey | NodeKey | HardwareKey
    key_algorithm:    KeyAlgorithm, // Ed25519 | X25519 | Secp256k1 | Dilithium | Falcon
    public_key_bytes: Vec<u8>,     // algorithm-agnostic
    state:            KeyState,    // Active | PendingRotation | Rotated | Revoked | Compromised
    created_at_slot:  u64,
    expires_at_slot:  Option<u64>,
    successor_key_id: Option<[u8; 32]>,
    rotation_policy:  Pubkey,      // pointer to RotationPolicy account
}
```

PDA seed: `[b"key", key_id]`

### 9.2 Rotation Policy Schema

```
RotationPolicy {
    owner:              Pubkey,
    approver_set:       Vec<Pubkey>,  // M-of-N approvers
    required_approvals: u8,           // M
    proposal_ttl_slots: u64,          // proposal expires if not approved within this window
}
```

---

## 10. Key Rotation Ceremony

```
Step 1 — InitiateRotation
   Owner submits: (key_id, new_public_key, key_algorithm)
   Creates RotationIntent PDA: [b"rotation", key_id]
   Key state: Active → PendingRotation

Step 2 — ApproveRotation (repeated M times)
   Each approver submits ApproveRotation(rotation_intent_id)
   Creates RotationApproval PDA: [b"rot-approval", rotation_intent_id, approver_pubkey]

Step 3 — ExecuteRotation (triggered after M approvals collected)
   Can be called by anyone once M approvals exist
   Creates new KeyRecord for the successor key (state = Active)
   Sets old KeyRecord state = Rotated, successor_key_id = new key_id
   Deletes RotationIntent account (rent reclaim)

Step 4 — Propagation
   revocation-registry emits KeyRotated event
   Gossip layer pushes NodeKeyRotation CrdsValue (for node keys)
   subnet-registry updates session references
```

Automatic trigger: when `current_slot >= expires_at_slot - one_epoch_slots`, validators
owning the key emit `InitiateRotation` automatically via the `key-lifecycle-monitor` background
task.

---

## 11. Emergency Zone Freeze

### 11.1 Trigger Authority

Zone freeze requires an `emergency-multisig` quorum. Default thresholds:

| Action | Required | Of |
| :--- | :---: | :---: |
| FreezeSubnet | 3 | 5 |
| UnfreezeSubnet | 3 | 5 |
| EmergencyRevokeKey | 4 | 5 |
| UpgradeClearancePolicy | 4 | 5 |

The multisig member set and thresholds are configurable per `MultisigConfig` account, but
raising thresholds requires the same threshold currently in effect.

### 11.2 Freeze Propagation Path

```
1. emergency-multisig ExecuteAction(FreezeSubnet { subnet_id, reason_code })
   └→ CPI into subnet-registry FreezeSubnet

2. subnet-registry sets SubnetRecord.is_frozen = true (same slot)

3. Gossip: SubnetFreeze CrdsValue pushed — all peers update their subnet cache

4. runtime/src/bank.rs pre-execution hook: reads SubnetRecord.is_frozen
   — if true, returns SubnetFrozen before any instructions execute
```

### 11.3 Proposal Lifecycle

```
ProposedAction {
    proposer:          Pubkey,
    action:            EmergencyAction,
    created_at_slot:   u64,
    expires_at_slot:   u64,        // created_at_slot + proposal_ttl_slots
    approval_count:    u8,
    approvals:         Vec<Pubkey>,
    status:            ProposalStatus, // Pending | Executed | Cancelled | Expired
}
```

A proposal that passes its `expires_at_slot` is permanently rejected — it cannot be
retroactively approved. New proposal must be submitted.

---

## 12. SGX Enclave Execution Contract (L5)

The following is the agreed behavioral contract between the validator software and L5 program
execution. This is not a smart contract — it is a validator implementation requirement.

1. Validator receives a transaction with `tier = L5` in the `EncryptedPayloadEnvelope`
2. Validator checks its own capability flag `supports_sgx_enclave`
3. If `false`: validator returns `RequiresEnclave` error and does NOT execute the transaction
4. If `true`: validator forwards the encrypted payload to its local enclave worker process
5. Enclave worker:
   a. Loads the L5 session key (hardware-bound, never leaves the enclave)
   b. Decrypts the instruction data inside the enclave boundary
   c. Executes the instruction against a private state mirror
   d. Computes the state delta
   e. Re-encrypts the state delta with the recipient's public key
   f. Returns the encrypted delta + execution receipt to the validator
6. Validator commits the encrypted delta to the ledger
7. Public ledger records: transaction signature, slot, L5 tier flag — instruction data opaque

---

## 13. Post-Quantum Signing Plan

Post-quantum signing is a Phase 3 stretch goal. The `KeyAlgorithm` enum is defined to be
algorithm-agnostic now so migration requires no schema changes.

```
KeyAlgorithm {
    Ed25519,      // current default for L0–L4
    X25519,       // ECDH only
    Secp256k1,    // hardware wallet compatibility
    Dilithium3,   // NIST PQC — target for L5 zones
    Falcon512,    // NIST PQC — alternative for L5 zones
}
```

Migration path:
1. L5 subnets created after Phase 3 launch may specify `required_key_algorithm = Dilithium3`
2. Existing L5 subnets continue using Ed25519 until their validator sets rotate
3. Dual-key mode: validator registers both Ed25519 and Dilithium3 keys; signs with both during
   transition
4. L1–L4 migration follows after L5 validation period (Phase 4+)

---

## 14. FinTech Compliance Mapping

| Control | Mechanism | Applies To |
| :--- | :--- | :--- |
| Transaction integrity | Stateless Ed25519 signatures on all instructions | L0–L5 |
| Replay prevention | Nonce + slot timestamp in AAD of encrypted envelope | L2–L5 |
| API abuse prevention | Permission-scoped keys via wallet-permissions program | L0–L5 |
| Auditability | Immutable on-chain audit log (WalletPermissionAuditLogEntry) | L0–L5 |
| Payload privacy | AES-256-GCM + ECIES per section 6 and 7 | L2–L5 |
| Key management | Key lifecycle per section 9 and 10 | L2–L5 |
| Access control | EvaluateAccess chain per section 3 | L1–L5 |
| Emergency controls | Zone freeze via emergency-multisig per section 11 | L3–L5 |
| Minimum key strength | 256-bit keys enforced by KeyStrengthCheck | L2–L5 |
| Encryption in transit | TLS 1.3 + Noise Protocol for all RPC and P2P | L0–L5 |

### Compliance Targets

- **PCI-DSS**: L2+ subnets handling payments satisfy DSS requirements 3 (stored data),
  4 (transit encryption), 7 (access control), 8 (key management), 10 (audit logging)
- **ISO 27001**: Annex A controls A.9 (access control), A.10 (cryptography), A.12 (operations
  security), A.14 (system security) are addressed by the Permission Layer
- **SOC 2 Type II**: Trust Service Criteria CC6 (logical access), CC7 (operations), CC9 (risk
  mitigation) map to clearance system, audit log, and emergency controls respectively
- **GDPR / NDPR**: Payload encryption means PII never appears in plaintext on the public ledger;
  ZK proofs (zk-SNARK for age/identity) avoid on-chain PII entirely

---

## Sign-Off Checklist

Before any Phase 3 contract code is written, confirm all of the following:

- [x] Clearance tier entry criteria are acceptable to the initial IdP partners
- [x] SBT account schema and PDA seeds are final
- [x] Encrypted payload envelope format and overhead (126 bytes fixed) are acceptable
- [x] Key ID derivation formula is final
- [x] Subnet ID derivation formula is final
- [x] M-of-N thresholds for emergency-multisig are approved
- [x] SGX enclave behavioral contract is reviewed by validator infrastructure team
- [x] Post-quantum timeline (Phase 3 stretch / Phase 4) is agreed
- [x] FinTech compliance mapping reviewed by legal/compliance
