# Aeko Rebrand and Workspace Recovery

## Summary

This document records the Aeko rebrand work completed so far, the compile failures that were fixed during recovery, how to build and run the workspace, and the technically accurate boundary between project-owned rebranding and upstream compatibility constraints.

This repo started from a Solana-derived codebase and was rebranded toward Aeko. During that process, some text replacements were safe and desired, while others broke compilation because they touched upstream dependency names and module paths exported by external crates.

The work completed in this phase focused on two goals:

1. Remove project-owned Solana branding and replace it with Aeko.
2. Restore successful compilation where broad text replacement broke upstream compatibility imports.

## What We Changed

### 1. Workspace dependency recovery

The workspace stopped building after broad renaming because some dependencies no longer resolved.

Fixes applied:

- Restored broken upstream patch URLs in the root [Cargo.toml](/Users/surdma/Dev/aeko/Cargo.toml)
  - `crossbeam`
  - `curve25519-dalek`
  - `tokio`
- Added a local vendored `aeko_rbpf` crate at [rbpf](/Users/surdma/Dev/aeko/rbpf) because `aeko_rbpf` does not exist on crates.io.
- Added a local `aeko-nohash-hasher` crate at [nohash-hasher](/Users/surdma/Dev/aeko/nohash-hasher) because `aeko-nohash-hasher` does not exist on crates.io.
- Wired both crates into the workspace root [Cargo.toml](/Users/surdma/Dev/aeko/Cargo.toml).

### 2. Project-facing rebrand cleanup

The project-facing surface was rebranded from Solana to Aeko across:

- CLI and validator help text
- install tooling
- release and GitHub workflow surface
- scripts and operator tooling
- docs and templates
- various script and binary names

Examples:

- `--faucet-sol` -> `--faucet-aeko`
- `--faucet-per-time-sol-cap` -> `--faucet-per-time-aeko-cap`
- `--faucet-per-request-sol-cap` -> `--faucet-per-request-aeko-cap`
- `--rent-exempt-reserve-sol` -> `--rent-exempt-reserve-aeko`

### 3. Compile recovery after unsafe broad rename

The aggressive rename changed several upstream SPL paths that must stay as exported by external crates.

These were restored where necessary.

Files fixed during compile recovery include:

- [account-decoder/src/parse_token.rs](/Users/surdma/Dev/aeko/account-decoder/src/parse_token.rs)
- [account-decoder/src/parse_token_extension.rs](/Users/surdma/Dev/aeko/account-decoder/src/parse_token_extension.rs)
- [transaction-status/src/parse_token.rs](/Users/surdma/Dev/aeko/transaction-status/src/parse_token.rs)
- [transaction-status/src/parse_token/extension/group_member_pointer.rs](/Users/surdma/Dev/aeko/transaction-status/src/parse_token/extension/group_member_pointer.rs)
- [transaction-status/src/parse_token/extension/group_pointer.rs](/Users/surdma/Dev/aeko/transaction-status/src/parse_token/extension/group_pointer.rs)
- [transaction-status/src/parse_token/extension/metadata_pointer.rs](/Users/surdma/Dev/aeko/transaction-status/src/parse_token/extension/metadata_pointer.rs)
- [transaction-status/src/parse_token/extension/mint_close_authority.rs](/Users/surdma/Dev/aeko/transaction-status/src/parse_token/extension/mint_close_authority.rs)
- [transaction-status/src/parse_token/extension/transfer_hook.rs](/Users/surdma/Dev/aeko/transaction-status/src/parse_token/extension/transfer_hook.rs)
- [transaction-status/src/parse_token/extension/permanent_delegate.rs](/Users/surdma/Dev/aeko/transaction-status/src/parse_token/extension/permanent_delegate.rs)
- [tokens/src/spl_token.rs](/Users/surdma/Dev/aeko/tokens/src/spl_token.rs)
- [tokens/src/commands.rs](/Users/surdma/Dev/aeko/tokens/src/commands.rs)
- [ledger/src/token_balances.rs](/Users/surdma/Dev/aeko/ledger/src/token_balances.rs)
- [sdk/program/src/native_token.rs](/Users/surdma/Dev/aeko/sdk/program/src/native_token.rs)
- [validator/src/admin_rpc_service.rs](/Users/surdma/Dev/aeko/validator/src/admin_rpc_service.rs)

### 4. CLI cleanup

Deprecated `lamports_of_sol` call sites were updated to `lamports_of_aeko` in:

- [cli/src/nonce.rs](/Users/surdma/Dev/aeko/cli/src/nonce.rs)
- [cli/src/stake.rs](/Users/surdma/Dev/aeko/cli/src/stake.rs)
- [cli/src/wallet.rs](/Users/surdma/Dev/aeko/cli/src/wallet.rs)

### 5. Local `rbpf` rebrand cleanup

The local vendored `rbpf` crate was cleaned where the remaining text was project-owned rather than dependency-owned.

Examples:

- maintainer email updated from `maintainers@solana.com` to `maintainers@aeko.chain`
- verifier comment changed to refer to Aeko programs
- [rbpf/tests/elfs/elfs.sh](/Users/surdma/Dev/aeko/rbpf/tests/elfs/elfs.sh) updated to use `sbf-aeko-aeko`

## Problems We Solved

### Problem 1: workspace member manifest failures

The workspace originally failed because dependencies had been renamed to Aeko names that did not actually exist on crates.io or in the workspace.

Solved by:

- restoring valid dependency declarations
- vendoring missing crates locally
- reconnecting the workspace graph

### Problem 2: broken SPL imports after aggressive renaming

Broad text replacement changed imports like:

- `spl_token::solana_program::...`
- `spl_token_2022::solana_program::...`
- `spl_token_2022::solana_zk_token_sdk::...`

into invalid Aeko-prefixed variants.

Solved by:

- restoring the upstream module paths exported by SPL crates
- keeping Aeko naming only in project-owned code and user-facing text

### Problem 3: mixed `Pubkey` types in tests

Some tests mixed Aeko `Pubkey` with upstream SPL `Pubkey` types, which caused type mismatches.

Solved by:

- normalizing the SPL-side test fixtures to SPL pubkeys before packing/unpacking

### Problem 4: CLI drift after rebrand

Some CLI call sites still used deprecated or Solana-era helper names.

Solved by:

- switching remaining call sites to Aeko-named helpers

## How To Build

### Fast inner loop

Use targeted crate builds while developing:

```bash
cargo check -p <crate>
cargo build -p <crate>
cargo test -p <crate>
```

Examples:

```bash
cargo check -p aeko-ledger
cargo build -p aeko-validator
cargo test -p aeko-cli
```

### Full workspace build

Run this before merge or after changing shared crates:

```bash
cargo build --workspace
```

### Validator test example

```bash
cargo test -p aeko-validator
```

## How To Run Locally

### Local validator

```bash
cargo run --bin aeko-validator -- --ledger ./test-ledger
```

### Test validator

```bash
cargo run -p aeko-validator --bin aeko-test-validator -- --ledger ./test-ledger --reset
```

## Current Compile Verification Status

At the time this document was written:

- `cargo build -p aeko-account-decoder` passed
- `cargo test -p aeko-validator` passed earlier in the recovery sequence
- a long `cargo build --workspace` progressed through most of the workspace and eventually surfaced a late failure in `aeko-ledger`
- that failure was fixed in [ledger/src/token_balances.rs](/Users/surdma/Dev/aeko/ledger/src/token_balances.rs)

The failing error was:

- invalid renamed import `spl_token_2022::aeko_program::...`

The fix was:

- restore `spl_token_2022::solana_program::pubkey::Pubkey`

A fresh workspace verification build is still required after that last ledger fix.

## So The Technically Accurate State Is

1. Most project-owned Solana branding has been rebranded to Aeko.
2. The workspace has been substantially stabilized after the broad rename.
3. Some `solana` strings still remain in the repository.
4. Those remaining strings are primarily upstream compatibility names, not project-branding leftovers.
5. The main remaining validation task is a fresh `cargo build --workspace` after the last ledger fix.

## Correct Boundary

If the repo is to remain honest and stable, the correct boundary is this:

1. Rebrand all project-owned names, docs, scripts, binaries, flags, and user-facing text from Solana to Aeko.
2. Do not blindly rename upstream dependency identifiers, lockfile package names, or module paths that are exported by external crates.
3. Keep compatibility imports like `spl_token::solana_program` and `spl_token_2022::solana_program` until those upstream crates are explicitly forked and renamed.
4. Only remove those remaining upstream `solana` names if the team decides to fork the SPL ecosystem and accept the maintenance burden.

This is the correct boundary because otherwise the code becomes less stable, not more branded.

## Will This Build Successfully On Other Developer Machines?

### macOS

Likely yes, provided the machine has the standard native dependencies required by this workspace and uses the expected Rust toolchain. The current recovery work was executed on macOS, and the active workspace build progressed deep into the graph on macOS before hitting the late ledger error that has now been fixed.

### Linux

Likely yes, with the same caveat: required native build dependencies must be installed. The repository contains Linux-focused CI and deployment scripts, which is a good signal that Linux remains a supported development environment.

### Windows

Not guaranteed from this recovery alone.

Important facts:

- The repository has Windows CI and release workflow references, which suggests Windows is at least intended to be supported in some capacity.
- However, this recovery work was not executed on a Windows machine.
- The current live validation happened on macOS, not Windows.
- Some crates and scripts in this repo are clearly Unix-oriented.
- Native dependencies such as RocksDB, OpenSSL, and related toolchains can make Windows builds more sensitive.

So the honest answer is:

- The repo may build on Windows.
- There is evidence that Windows is considered in CI and release automation.
- But this specific rebrand-and-recovery work has not yet been validated end-to-end on a Windows developer machine.
- If your daily environment is Windows, you should expect at least some environment-specific setup or fixes.

## Recommended Developer Workflow

For day-to-day work:

```bash
cargo check -p <crate>
cargo test -p <crate>
```

Before pushing broad changes:

```bash
cargo build --workspace
```

For local network work:

```bash
cargo run --bin aeko-validator -- --ledger ./test-ledger
```

## Remaining Work

1. Run a fresh `cargo build --workspace` after the last fix in [ledger/src/token_balances.rs](/Users/surdma/Dev/aeko/ledger/src/token_balances.rs).
2. If new failures appear, continue the same recovery pattern:
   - isolate the crate
   - determine whether the failure is project-owned drift or upstream compatibility drift
   - only rename project-owned code
   - restore upstream compatibility paths where needed
3. If the team wants literal zero `solana` strings in tracked source, make that an explicit fork plan for upstream SPL crates rather than continuing with blind search-and-replace.

## Bottom Line

The repo is much closer to an Aeko-owned codebase now, and the compile recovery path is clear.

But there is a hard technical distinction between:

- project-owned branding drift, which should be removed
- upstream compatibility names, which must remain until those dependencies are deliberately forked

That distinction is what keeps the repo both honest and stable.
