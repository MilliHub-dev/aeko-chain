# Node Implementation

This directory contains the source code for the AEKO Validator and RPC node.

## Getting Started
To run a local test validator:
```bash
cargo run --bin aeko-validator -- --ledger ./test-ledger
```

## Components
*   **Validator**: The consensus participation node.
*   **RPC**: The JSON-RPC gateway for clients.
*   **Indexer**: Services for indexing social data.
