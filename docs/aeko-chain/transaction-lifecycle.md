# Transaction Lifecycle

Understanding how a transaction moves from a user's wallet to being finalized on the blockchain is crucial for developers.

## The Journey of a Transaction

1.  **Creation & Signing**
    *   User creates a transaction (e.g., "Post a Message") via the Aeko App or SDK.
    *   The transaction is signed with the user's private key (Ed25519).
    *   *Optional*: If the transaction is a "Private Zone" action, a Zero-Knowledge Proof or Access Token is attached.

2.  **Submission (RPC)**
    *   The wallet sends the transaction to an RPC Node.
    *   The RPC node checks basic validity (is the signature correct? does the user have enough AEKO for gas?).

3.  **Permission Check (The AEKO Step)**
    *   Before entering the mempool, the **Permission Layer** validates the user's clearance.
    *   *Example*: If a user tries to post to a "Military-Grade" channel without the correct `SBT` (Soulbound Token), the transaction is rejected instantly, saving gas and network resources.

4.  **TPU Processing (Validator)**
    *   The transaction is forwarded to the current Leader (Validator).
    *   The Leader's TPU (Transaction Processing Unit) schedules it.
    *   **Sealevel** executes the transaction in parallel with others.

5.  **Block Production & Voting**
    *   The Leader packages the transaction into a "Entry" and streams it to other validators via **Turbine** (block propagation protocol).
    *   Validators verify and vote on the block.

6.  **Finality**
    *   Once >66% of stake has voted on the block, it is "Optimistically Confirmed".
    *   After 32 blocks (slots), it is "Root Finalized" (mathematically irreversible).
