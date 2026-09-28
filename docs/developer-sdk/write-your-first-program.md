# Write Your First AEKO Program

This guide gives external developers a minimal path to writing and deploying an AEKO on-chain program in Rust.

## What Developers Can Build

Yes, other developers can write smart contracts on AEKO Chain.

In this repo, the on-chain Rust surface is built around:

- [`sdk/program`](../../sdk/program/)
- the AEKO CLI documented in [`cli-tools.md`](./cli-tools.md)
- the existing SBF examples under [`programs/sbf/rust`](../../programs/sbf/rust/)

The normal mental model is:

- write your program against `aeko-program`
- build it for the AEKO SBF target
- deploy it with `aeko program deploy`

## Starter Template

A minimal starter now lives at:

- [`contracts/hello-aeko-program`](../../contracts/hello-aeko-program/)

That template is intentionally tiny:

- one instruction entrypoint
- one log line
- no custom accounts
- no custom serialization yet

It is meant to be the smallest useful external starting point.

## Program Code

The core entrypoint pattern looks like:

```rust
use aeko_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Hello from AEKO!");
    msg!("instruction bytes: {}", instruction_data.len());
    Ok(())
}
```

## Local Setup

You need:

- Rust toolchain
- AEKO CLI
- AEKO SBF build tooling from this repo or your installed AEKO toolchain

CLI install guide:

- [`cli-tools.md`](./cli-tools.md)

## Build Flow

From the repository root, use AEKO's checked-in SBF wrapper:

```bash
./cargo-build-sbf \
  --manifest-path contracts/hello-aeko-program/Cargo.toml \
  --sbf-out-dir contracts/hello-aeko-program/target/deploy
```

This produces `hello_aeko_program.so` plus the generated
`hello_aeko_program-keypair.json`. A normal host `cargo build` is not a
substitute for the SBF build.

## Deploy Flow

Once the program artifact exists:

```bash
aeko program deploy contracts/hello-aeko-program/target/deploy/hello_aeko_program.so
```

Or from this repo if the CLI is not globally installed:

```bash
cargo run -p aeko-cli --bin aeko -- \
  program deploy contracts/hello-aeko-program/target/deploy/hello_aeko_program.so
```

## CI Compatibility Gate

The dedicated `Smart contracts (SBF → AEKO SVM)` CI job builds this starter
as SBF, starts an isolated AEKO TestValidator, deploys the generated artifact
through the real `aeko program deploy` CLI path, verifies the program account
is executable, runs `examples/invoke_hello.rs`, and requires a confirmed
transaction whose logs contain `Hello from AEKO!`.

That smart-contract gate is intentionally separate from validator/Faucet/
bootstrap image validation, while still proving compatibility with the AEKO SVM
and CLI.

## Suggested Next Steps After Hello World

1. Add a simple instruction enum.
2. Add account validation.
3. Add Borsh-based instruction decoding.
4. Add a client or test that sends your instruction.
5. Add processor tests before storing custom state.

## Related Docs

- [`rust-sdk.md`](./rust-sdk.md)
- [`cli-tools.md`](./cli-tools.md)
- [`deploy-and-invoke-testnet.md`](./deploy-and-invoke-testnet.md)
- [`repo-structure.md`](../contributing/repo-structure.md)
