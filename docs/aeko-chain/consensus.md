# Consensus Mechanism

AEKO Chain uses a hybrid consensus model combining **Proof of History (PoH)** for timekeeping and **Tower BFT** for agreement.

## Proof of History (PoH)
PoH is a cryptographic clock. It solves the "time" problem in distributed systems.
*   Instead of validators talking to each other to agree on "what time it is", they run a recursive SHA-256 hashing function locally.
*   This creates a verifiable "passage of time" record.
*   Validators can stamp transactions into this stream, proving *when* they occurred relative to other events.

## Tower BFT (Byzantine Fault Tolerance)
Tower BFT is our implementation of Practical BFT (pBFT), optimized for the PoH clock.
*   **Liveness**: The network keeps moving even if some nodes are offline.
*   **Finality**: As validators vote on blocks, their votes have "lockouts" that double in duration. After a certain number of confirmations, a block is mathematically impossible to roll back (finalized).

## Reputation-Weighted Voting (The AEKO Twist)
In standard PoS, only token stake matters. In AEKO Chain's governance sub-layers, we introduce **Reputation Weights**.
*   For critical updates to the **Permission Layer**, a validator's vote weight is influenced by their **Node Reputation Score** (uptime, honest behavior, geographic diversity).
*   This prevents a "rich get richer" attack vector where a malicious actor buys 51% of tokens to hijack the permission system.
