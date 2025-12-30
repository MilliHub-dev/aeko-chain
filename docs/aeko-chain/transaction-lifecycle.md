# Transaction Lifecycle

This document explains how a transaction flows through AEKO Chain.

---

## Transaction Steps

1. Transaction is constructed
2. Signed by wallet (Ed25519)
3. Submitted via RPC
4. Verified by validator
5. Ordered via PoH
6. Executed in AEKO-SVM
7. State updated
8. Receipt generated

---

## Transaction Components

- Instructions
- Account list
- Signatures
- Recent block hash
- Compute unit limit

---

## Failure Handling

If execution fails:
- State changes are reverted
- Fees are partially consumed
- Logs are emitted

---

## Post Verification Use Case

For AEKO Social:
- A post hash is signed
- Signature is anchored
- Anyone can verify authenticity via RPC

## Stateless Transactions

Many AEKO transactions do not modify account state.

Examples:
- Social post signatures
- Message authenticity proofs
- Identity attestations

These transactions:
- Verify signatures
- Anchor timestamps
- Emit verifiable receipts
