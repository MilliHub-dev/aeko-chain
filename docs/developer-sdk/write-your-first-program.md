# Write Your First AEKO Program

This guide gives external developers a minimal path to writing and deploying an AEKO on-chain program in Rust.

## What Developers Can Build

Yes, other developers can write smart contracts on AEKO Chain.

In this repo, the on-chain Rust surface is built around:

- [`sdk/program`](/Users/ok/Documents/projects/aeko-chain/sdk/program)
- the AEKO CLI documented in [`docs/developer-sdk/cli-tools.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/cli-tools.md)
- the existing SBF examples under [`programs/sbf/rust`](/Users/ok/Documents/projects/aeko-chain/programs/sbf/rust)

The normal mental model is:

- write your program against `aeko-program`
- build it for the AEKO SBF target
- deploy it with `aeko program deploy`

## Starter Template

A minimal starter now lives at:

- [`contracts/hello-aeko-program`](/Users/ok/Documents/projects/aeko-chain/contracts/hello-aeko-program)

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

- [`docs/developer-sdk/cli-tools.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/cli-tools.md)

## Build Flow

From your program directory:

```bash
cargo build-bpf
```

If your toolchain uses the newer AEKO SBF command naming, follow your local AEKO build setup. The repo still references the classic build path in several places for familiarity.

## Deploy Flow

Once the program artifact exists:

```bash
aeko program deploy target/deploy/hello_aeko_program.so
```

Or from this repo if the CLI is not globally installed:

```bash
cargo run --bin aeko -- program deploy target/deploy/hello_aeko_program.so
```

## Suggested Next Steps After Hello World

1. Add a simple instruction enum.
2. Add account validation.
3. Add Borsh-based instruction decoding.
4. Add a client or test that sends your instruction.
5. Add processor tests before storing custom state.

## Related Docs

- [`docs/developer-sdk/rust-sdk.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/rust-sdk.md)
- [`docs/developer-sdk/cli-tools.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/cli-tools.md)
- [`docs/developer-sdk/deploy-and-invoke-testnet.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/deploy-and-invoke-testnet.md)
- [`docs/contributing/repo-structure.md`](/Users/ok/Documents/projects/aeko-chain/docs/contributing/repo-structure.md)
