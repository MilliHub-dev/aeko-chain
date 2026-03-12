# Repository Structure

This document outlines the high-level structure of the AEKO Chain repository.

```
aeko-chain/
├── programs/       # Native on-chain programs
├── core/           # Validator pipeline and consensus orchestration
├── runtime/        # Bank and state-transition logic
├── validator/      # Validator binaries and operator CLI
├── rpc/            # JSON-RPC services
├── sdk/            # Rust SDK and SBF tooling
├── system-test/    # Multi-node and operator integration scripts
├── web/            # Documentation and marketing web app
├── docs/           # Product and protocol documentation
├── protocol/       # Reserved for future protocol-design extracts
└── contracts/      # Reserved for future contract examples/tests
```

## Directory Details

### `programs/`
Contains the native on-chain programs that are compiled into the current validator runtime, such as system, vote, stake, loader, config, and compute-budget programs.

### `core/`, `runtime/`, `svm/`, `program-runtime/`
Contain the validator execution pipeline, replay logic, Bank/state transition logic, and runtime support crates.

### `validator/` and `rpc/`
Contain the validator binaries, operator-facing CLI surface, admin RPC, and JSON-RPC services.

### `sdk/`
Contains the Rust SDK, program SDK, and SBF developer tooling that applications and on-chain programs use today.

### `docs/`
Contains the AEKO architecture, roadmap, governance, wallet, bridge, permission-layer, and token-standard documentation.

### `protocol/` and `contracts/`
These directories are currently placeholders. They should not be treated as evidence that the corresponding AEKO-specific protocol modules have already been implemented.
