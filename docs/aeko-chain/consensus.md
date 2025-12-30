# Consensus Mechanism

AEKO Chain uses a **Hybrid Proof-of-Stake (PoS) + Proof-of-History (PoH)** consensus design.

---

## Proof-of-History (PoH)

PoH provides a cryptographic clock that:
- Orders transactions deterministically
- Reduces consensus overhead
- Enables parallel execution

PoH works by continuously hashing:

H(n+1) = SHA256(H(n))


Each transaction references a PoH hash, providing a verifiable timestamp.

---

## Proof-of-Stake (PoS)

Validators stake **AEKO Coin** to:
- Produce blocks
- Vote on forks
- Secure the network

### Validator Selection
- Stake-weighted
- Performance-weighted
- Slashing for misbehavior

---

## Finality Model

- Optimistic confirmation in milliseconds
- Finality achieved after validator supermajority confirmation
- Forks resolved quickly due to PoH ordering

---

## Security Guarantees

- Byzantine fault tolerance
- Sybil resistance via staking
- Slashing for equivocation or downtime