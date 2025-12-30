# Stateless Signature Model (SSM)

AEKO Chain uses a **Stateless Signature Model (SSM)** for identity verification,
content authenticity, and event proofs.

In this model, **signatures—not stored accounts—are the primary source of truth**.

---

## Why Stateless?

Traditional blockchains rely on:
- Persistent user accounts
- On-chain state updates for every action
- High storage overhead

AEKO instead anchors **cryptographic proofs**, not user state.

This makes the chain:
- Faster
- Cheaper
- More scalable
- Easier to verify independently

---

## Core Principle

> **If a message is signed by a valid key at a verifiable time, it is true.**

No additional account state is required.

---

## Signature Structure

Each signed payload contains:

```json
{
  "payload_hash": "32-byte hash",
  "signer_pubkey": "ed25519 public key",
  "signature": "ed25519 signature",
  "timestamp": "unix time",
  "domain": "AEKO_SOCIAL | AEKO_WALLET | AEKO_PERMISSION"
}

The blockchain only needs to verify:

Signature validity

Timestamp ordering (via PoH)

Optional domain rules

What Is Stored On-Chain?

Minimal anchoring data only:

Signature hash

Block reference

Optional metadata pointer

The content itself remains off-chain (e.g. AEKO Social DB, IPFS, cloud).

What Is NOT Stored On-Chain?

User profiles

Post content

Social graphs

Messages

This keeps AEKO Chain lean and performant.

Verification Flow

User signs content off-chain

Signature is submitted to AEKO Chain

Validators verify:

Ed25519 signature

Timestamp ordering

Proof is anchored

Anyone can independently verify authenticity

Benefits

Infinite scalability for social posts

No per-user account creation cost

Zero state bloat

Verifiable forever

Ideal for SocialFi and communication systems


---

## 🔄 Update Existing Files (IMPORTANT)

### ✅ Update `chain-overview.md`

Add this section:

```md
## Stateless by Design

AEKO Chain uses a **Stateless Signature Model**, meaning that:
- Most user actions do not mutate on-chain state
- Cryptographic signatures act as proofs of authenticity
- The chain serves as a verification and timestamping layer

This model is critical for scaling social content and secure communications.