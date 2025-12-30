# AEKO-SVM Runtime

AEKO-SVM is AEKO Chain’s execution environment, inspired by Solana’s Sealevel runtime.

---

## Runtime Model

- Stateless programs
- Explicit account passing
- Parallel execution for non-conflicting transactions
- Deterministic execution

---

## Program Characteristics

- Compiled to BPF bytecode
- Written primarily in Rust
- Deployed as on-chain programs
- Upgradable (optional authority)

---

## Account Model

Each account contains:
- Owner program ID
- Balance (AEKO Coin or tokens)
- Arbitrary data buffer
- Permission flags

Programs cannot access accounts not explicitly passed.

---

## Parallel Execution

Transactions execute in parallel if they:
- Do not write to the same accounts
- Do not conflict on state

This allows massive scalability without sharding.

## Stateless Instructions

AEKO-SVM supports stateless instructions where:
- No writable accounts are required
- Execution verifies cryptographic proofs only
- No persistent storage is modified

This enables extremely high throughput for verification workloads.
