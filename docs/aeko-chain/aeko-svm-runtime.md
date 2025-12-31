# AEKO SVM Runtime

The **AEKO SVM (Solana Virtual Machine)** is the execution engine of the AEKO Chain. It is a highly optimized environment designed to process thousands of smart contract interactions in parallel.

## Key Components

### 1. Sealevel Parallelization
Traditional blockchains (like EVM) are single-threaded; one transaction must finish before the next begins. AEKO SVM uses **Sealevel**, which allows the runtime to identify which transactions don't touch the same data (accounts) and execute them on separate CPU cores simultaneously.
*   *Result*: Massive throughput scaling with hardware (Moore's Law).

### 2. Pipelining (TPU)
The **Transaction Processing Unit (TPU)** pipelines data fetching, signature verification, and banking into distinct hardware stages.
1.  **Fetch**: Pull transaction data.
2.  **SigVerify**: Verify cryptographic signatures (offloaded to GPU).
3.  **Bank**: Execute state changes.
4.  **Write**: Commit to ledger.

### 3. Native Extensions for Content
We have extended the standard SVM with native instructions (syscalls) specifically for SocialFi:
*   `VerifyContentHash`: A cheap, native instruction to verify SHA-256/Keccak hashes of off-chain media.
*   `UpdateReputation`: A specialized syscall for updating user scores without full smart contract overhead.
*   `CheckPermission`: A pre-flight check that validates a user's clearance level (Public/Private/Sovereign) before execution.

## Developing for AEKO SVM

Developers write programs (smart contracts) in **Rust** using the AEKO SDK (a fork of the Solana SDK with added SocialFi modules). These are compiled to **BPF (Berkeley Packet Filter)** bytecode, which is fast, safe, and JIT-compiled to native machine code.
