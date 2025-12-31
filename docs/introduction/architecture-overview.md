# Architecture Overview

AEKO Chain utilizes a modular, layered architecture to achieve its unique blend of speed and security.

```mermaid
graph TD
    User[User / Client] --> AppLayer[Application Layer<br/>(Aeko Social, SDKs)]
    AppLayer --> PermLayer[Permission Layer<br/>(Identity & Access Control)]
    PermLayer --> Runtime[AEKO SVM Runtime<br/>(Transaction Execution)]
    Runtime --> Consensus[Consensus Layer<br/>(PoH + Tower BFT)]
    Runtime --> ContentLayer[Content Signature Layer<br/>(Off-chain Storage + On-chain Proofs)]
```

## 1. Permission Layer (The Gatekeeper)
Unlike standard blockchains where anyone with a key can submit any transaction, AEKO Chain intercepts transactions at the **Permission Layer**.
*   **Public Zone**: Standard transactions (transfers, basic posts). Open to all.
*   **Verified Zone**: Requires KYC/Identity proofs (SBTs).
*   **Sovereign Zone**: Restricted to whitelisted keys (Government/Enterprise).

## 2. AEKO SVM Runtime (The Engine)
We leverage the **Solana Virtual Machine (SVM)** for parallel transaction processing.
*   **Sealevel**: Parallel smart contract execution.
*   **Pipelining**: Optimized transaction validation unit (TPU).
*   **AccountsDB**: Modified to store social graph data efficiently.

## 3. Content Signature Layer (The Truth)
To avoid bloating the chain, we use a hybrid storage model:
*   **Heavy Media** (Images/Video) -> IPFS / Arweave / Private Cloud.
*   **Metadata & Hashes** -> Stored on AEKO Chain.
*   **Signatures** -> Verified natively by the runtime.

## 4. Consensus Layer (The Judge)
*   **Proof of History (PoH)**: For cryptographic time-stamping.
*   **Tower BFT**: For rapid finality.
*   **Weighted Staking**: Validators are weighted not just by tokens, but by **Reputation Score** (in specific governance sub-nets).
