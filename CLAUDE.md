# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AEKO Chain** is a SocialFi and FinTech-native blockchain designed for verifiable content, programmable trust, and controlled access environments. It's a Solana fork written in Rust featuring:

- Multi-tier permission system (public, private, sovereign)
- Content signature layer for proof-of-authorship
- On-chain SocialFi programs (posts, rewards, staking, anti-spam, monetization)
- Custom token standards (SPL-style token-20, token-721, creator coins)
- Comprehensive SDK and RPC infrastructure

## Workspace Structure

This is a large Rust monorepo (~150+ crates) organized as follows:

- **Core blockchain** (`core/`, `runtime/`, `ledger/`, `poh/`): Consensus, transaction execution, and state management
- **Programs** (`programs/`): On-chain smart contracts
  - System programs (`system/`, `stake/`, `vote/`, `config/`)
  - SocialFi programs (`social-posts/`, `social-rewards/`, `social-staking/`, `social-anti-spam/`, `social-monetization/`)
  - Token programs (`token-20/`, `token-721/`, `tokenomics/`, `public-mint/`)
  - Permission programs (`wallet-permissions/`, `permission-types/`, `permission-registry/`, `revocation-registry/`, `subnet-registry/`, `emergency-multisig/`, `finality-oracle/`)
  - Utilities (`bpf_loader/`, `compute-budget/`, `address-lookup-table/`, `loader-v4/`)
  - SBF/BPF programs: `programs/sbf/rust/` contains bytecode programs (excluded from main workspace, compiled separately)
- **Network** (`gossip/`, `turbine/`, `quic-client/`, `streamer/`): P2P communication and message propagation
- **RPC & APIs** (`rpc/`, `rpc-client-api/`, `pubsub-client/`): JSON-RPC and WebSocket interfaces
- **SDK & Tools** (`sdk/`, `cli/`, `keygen/`, `validator/`, `test-validator/`): Developer tools and CLI utilities
- **Execution** (`svm/`, `program-runtime/`): Solana Virtual Machine and program execution sandbox
- **Security & Crypto** (`encryption-module/`, `zk-token-sdk/`, `zk-keygen/`, `wallet-core/`): Encryption (AES-GCM, ECIES, ratchet), ZK proofs, wallet permissions
- **Explorer** (`explorer-backend/`): Block explorer API (indexer, store, server)
- **Auxiliary** (`metrics/`, `logger/`, `accounts-db/`, `storage-bigtable/`): Infrastructure and utilities

## Common Development Commands

### Build
```bash
# Build entire workspace in debug mode
cargo build --workspace

# Build entire workspace in release mode (optimized, slower compile)
cargo build --workspace --release

# Build a specific crate
cargo build -p aeko-cli

# Build SBF/BPF programs (separate from main workspace)
cd programs/sbf && cargo build-sbf
```

### Testing
```bash
# Run all tests in the workspace
cargo test --workspace

# Run tests with nextest (faster, parallel execution, CI-optimized)
cargo nextest run --workspace

# Run a single test by name
cargo test --package aeko-client test_client_methods -- --exact

# Run tests in a specific crate
cargo test --package aeko-core

# Run integration tests with local cluster
cargo test --test '*' --workspace

# Run SBF program tests
cd programs/sbf && cargo test-sbf
```

### Linting & Formatting
```bash
# Check code formatting (don't modify)
cargo fmt --check --all

# Apply formatting
cargo fmt --all

# Run clippy linter on all targets
cargo clippy --workspace --all-targets

# Run clippy with fix (attempts automatic fixes, review changes)
cargo clippy --workspace --all-targets --fix --allow-dirty --allow-staged
```

### Development Workflow
```bash
# Build, test, and lint together (typical before committing)
cargo build --workspace && cargo test --workspace && cargo fmt --all && cargo clippy --workspace --all-targets

# Quick local testing (debug mode)
cargo test --workspace --lib

# Run a single integration test
cargo test --test test_name --package aeko-local-cluster -- --exact --nocapture
```

## Architecture & Design Patterns

### Consensus & Execution
- **PoH (Proof of History)**: Time-based consensus layer in `poh/`. Validators sequence transactions and create PoH ticks.
- **Slot-based block production**: 400ms slots, PoH creates deterministic ordering within and across slots.
- **BPF/SBF runtime** (`program-runtime/`, `svm/`): Sandboxed VM for executing smart contracts. Programs run inside the Solana Virtual Machine.

### On-Chain Programs
All programs under `programs/` follow a pattern:
- Written in Rust (with the `aeko-program` SDK macros)
- Deployed as SBF/BPF bytecode
- Entry point: `process_instruction()` function
- State stored in Accounts (persistent on-chain data structures)

**SocialFi program naming**: Programs prefixed `social-` are custom AEKO Chain extensions:
- `social-posts/`: Store and verify content signatures
- `social-rewards/`: Distribute creator rewards and engagement incentives
- `social-staking/`: Staking mechanisms tied to content quality
- `social-anti-spam/`: Reputation and spam filtering
- `social-monetization/`: Tipping, monetization, and revenue sharing

### Permission Layer
The permission system allows the chain to serve diverse deployment models (public, private, military-grade). This is enforced at the RPC/validator level and in program logic. The on-chain programs implementing this are:
- `permission-types/`: Shared type definitions for the permission system
- `permission-registry/`: Registry of permissions and clearance levels
- `wallet-permissions/`: Per-wallet permission enforcement
- `revocation-registry/`: Revocation of access/credentials
- `subnet-registry/`: Isolated subnet configuration
- `emergency-multisig/`: Emergency override with multi-signature approval
- `finality-oracle/`: Finality attestation for cross-environment trust

See `docs/permission-layer/` for detailed architecture.

### Accounts Database
AEKO Chain uses a sophisticated accounts database (`accounts-db/`):
- In-memory accounts with memory-mapped persistent storage
- Columnar format for memory efficiency
- Fast slot-based state roots for consensus
- Geyser plugin interface (`geyser-plugin-interface/`) for external state subscriptions

## Key Implementation Details

### Transaction Flow
1. **Entry** (`entry/`): Batches transactions, applies PoH verification
2. **Banking stage** (`core/`): Transaction scheduling and conflict detection (the validator pipeline lives in `core/`, not `banking-bench/` which is only benchmarks)
3. **SVM execution** (`svm/`, `program-runtime/`): Program execution in the sandboxed VM
4. **Runtime** (`runtime/`): State updates via Bank
5. **Ledger** (`ledger/`): Persistent storage of blocks and account state

### Program Development Considerations
- Programs have compute budget limits (checked by `compute-budget/` program)
- Cross-program invocation (CPI): Programs can invoke other programs
- Instruction introspection: Programs can verify caller and access account data
- Account size limits and rent (stake required to hold data on-chain)

See `docs/developer-sdk/` and `sdk/program/README.md` for SDK details.

### Testing Infrastructure
- **Local cluster** (`local-cluster/`): Spin up validators locally for integration tests
- **Program test** (`program-test/`): Mock runtime for unit testing programs without a full validator
- **Nextest**: Primary test runner configured in `nextest.toml` with CI-specific overrides

## Development Practices

### Dependency Management
- Workspace uses central `Cargo.toml` with shared dependencies
- All crates versioned together as `2.0.0`
- Patches for dependency issues in `[patch.crates-io]` section:
  - Custom `curve25519-dalek` fork to handle zeroize constraints
  - Custom `tokio` fork with commit `4eed411` reverted (performance issue)
  - These patches must remain in sync with downstream projects

### Rust Coding Standards
- `unsafe` blocks require a `// SAFETY:` comment explaining why the usage is sound
- No `unwrap()` in production code—use `Result` types and proper error handling
- Test code may use `unwrap()` where appropriate

### Clippy Linting
- Custom threshold: functions with >9 arguments allowed (blockchain code is complex)
- Clippy runs on all targets including tests and benches
- Review clippy warnings carefully—many are legitimate but some may conflict with SVM requirements

### Cargo.lock
- Lock file is committed. Always update before submitting PRs: `cargo update` or similar dependency changes

### Programs & SBF Compilation
- **SBF programs excluded** from main workspace (`exclude = ["programs/sbf"]`)
- Build SBF programs separately: `cd programs/sbf && cargo build-sbf`
- Programs are precompiled binaries loaded at runtime, not dynamic linking
- BPF Loader (`programs/bpf_loader/`) controls program deployment and upgrades

## Working with Documentation

- **Architecture**: `docs/introduction/architecture-overview.md` and `docs/aeko-chain/`
- **SocialFi specifics**: `docs/socialfi/` and `docs/aeko-social-integration/`
- **Permission layer**: `docs/permission-layer/` (important for understanding access control)
- **Developer guides**: `docs/developer-sdk/` with examples for common tasks
- **Contributing**: `docs/contributing/`

## Performance Considerations

### Benchmarking
- Benches in crates like `bench-tps/`, `accounts-bench/`, `banking-bench/`
- Run with: `cargo bench --package <name>`
- Use criterion for statistical analysis

## Common Issues

- **SBF program won't compile**: Must be in `programs/sbf` subdirectory using `cargo build-sbf`, not `cargo build`
- **Test hangs**: Some gossip/network tests are resource-intensive; nextest CI profile uses `threads-required = "num-cpus"` for these (see `nextest.toml`)
- **Workspace member not found**: Ensure the crate is listed in root `Cargo.toml` `[workspace.members]`
- **Duplicate crate versions**: Resolve with `cargo update -p <crate>` or by adjusting version constraints
