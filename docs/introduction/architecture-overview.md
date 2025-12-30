# Architecture Overview

AEKO CHAIN is a modular ecosystem composed of independent but interoperable components.

---

## High-Level Architecture

+--------------------+
| AEKO SOCIAL |
| (Node.js Backend) |
+---------+----------+
|
| Post Signature / Verification
|
+---------v----------+
| AEKO CHAIN |
| (SVM Runtime L1) |
+----+----+----+-----+
| | |
| | |
v v v
Wallet Bridge Explorer
APIs Layer APIs


---

## Component Breakdown

### AEKO Social
- Standalone Node.js backend
- Handles posts, feeds, users, moderation
- Uses AEKO Chain for:
  - Post signature anchoring
  - Identity verification
  - Reputation proofs

### AEKO Chain(Stateless Signature Model)
- High-performance Layer-1
- Solana-VM–style runtime (AEKO-SVM)
- Parallel transaction execution
- Native token & NFT standards

### Permission Layer
- Optional encryption & clearance system
- Used for:
  - Secure messaging
  - Financial institutions
  - Military communication

### Wallet
- Key management
- Transaction signing
- Permission handling
- dApp connection

### Explorer
- Transaction visibility
- Post verification
- Token & NFT tracking

### Bridge
- Cross-chain asset and message transfer
- Ethereum, Solana, BNB, others

---

## Design Philosophy

- **Loose coupling**: systems can evolve independently
- **Clear interfaces**: RPC, APIs, SDKs
- **Security boundaries**: social ≠ chain ≠ permission layer
