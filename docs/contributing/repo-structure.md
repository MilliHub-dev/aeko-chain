# Repository Structure

This document outlines the high-level structure of the AEKO Chain repository.

```
aeko-chain/
├── protocol/       # Core blockchain specs and consensus logic
├── contracts/      # Smart contracts (System programs & Examples)
├── node/           # Node implementation (Validator & RPC)
├── sdk/            # Client SDKs (Rust, TypeScript, Python)
├── docs/           # Documentation (Architecture, Guides, API)
```

## Directory Details

### `protocol/`
Contains the core specifications and cryptographic primitives used by the chain. This is the "brain" of AEKO.

### `contracts/`
Contains the native programs (Smart Contracts) that run on the AEKO SVM.
*   **System Programs**: Governance, Token, Permission Layer.
*   **Examples**: Reference implementations for developers.

### `node/`
The actual binary implementation of the AEKO Validator and RPC node.
*   Run this to participate in the network.

### `sdk/`
Libraries for developers to interact with the chain.
*   `js/`: TypeScript/JavaScript SDK.
*   `rust/`: Rust Crate.
*   `py/`: Python Package.

### `docs/`
The source code for the documentation you are reading right now.
