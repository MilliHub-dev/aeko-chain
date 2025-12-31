# AEKO Chain Overview

AEKO Chain is a Layer-1 blockchain built for speed, scale, and social integrity. It is not just a ledger of financial transactions but a ledger of *social truth*.

## Technical Specifications

*   **Block Time**: ~400ms
*   **Throughput**: 65,000+ TPS (Theoretical peak)
*   **Finality**: ~800ms
*   **Consensus**: Proof of History (PoH) + Tower BFT
*   **Smart Contract Engine**: AEKO SVM (Solana Virtual Machine)
*   **Programming Languages**: Rust, C, C++ (via LLVM)

## The "Social" Difference

Most blockchains treat all data as equal bytes. AEKO Chain distinguishes between:
1.  **Financial State**: Token balances, AMM pools.
2.  **Social State**: Identity graphs, content hashes, reputation scores.

By optimizing the runtime to handle these distinct state types efficiently, AEKO Chain prevents "social spam" from clogging "financial settlement" lanes, ensuring that a viral meme doesn't spike gas fees for a critical payment.

## Network Topology

The network consists of a decentralized mesh of **Validators** who produce blocks and **RPC Nodes** that serve data to applications. Unlike Ethereum's single global state, AEKO Chain uses **Sealevel** parallel processing to execute non-overlapping transactions simultaneously.
