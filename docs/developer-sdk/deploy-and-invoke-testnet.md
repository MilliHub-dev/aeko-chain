# Deploy And Invoke On Testnet

This guide takes an external developer from zero to first live AEKO program invocation on testnet.

It uses the minimal starter at:

- [`contracts/hello-aeko-program`](/Users/ok/Documents/projects/aeko-chain/contracts/hello-aeko-program)

And the invoke example at:

- [`contracts/hello-aeko-program/examples/invoke_hello.rs`](/Users/ok/Documents/projects/aeko-chain/contracts/hello-aeko-program/examples/invoke_hello.rs)

## Goal

By the end of this walkthrough, you will have:

- created or selected a deployer wallet
- funded it on testnet
- built the starter program
- deployed the program
- sent a real instruction to it
- captured the resulting transaction signature

## Prerequisites

You need:

- Rust installed
- AEKO CLI installed or the repo available locally
- access to a reachable AEKO testnet RPC
- a funded testnet wallet or faucet access

Related docs:

- [`docs/developer-sdk/cli-tools.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/cli-tools.md)
- [`docs/developer-sdk/write-your-first-program.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/write-your-first-program.md)

## Step 1. Create A Wallet

If you do not already have one:

```bash
aeko-keygen new
```

The default keypair path is usually:

```bash
~/.config/aeko/id.json
```

If your CLI is not globally installed, use the repo binary:

```bash
cargo run --bin aeko-keygen -- new
```

## Step 2. Point The CLI At Testnet

```bash
aeko config set --url https://api.testnet.aeko.chain
```

Repo-binary alternative:

```bash
cargo run --bin aeko -- config set --url https://api.testnet.aeko.chain
```

## Step 3. Fund The Wallet

Use the wallet public key from your keypair and request testnet funds:

```bash
aeko airdrop 10 <YOUR_WALLET_PUBKEY> --url testnet
```

If the CLI is not global:

```bash
cargo run --bin aeko -- airdrop 10 <YOUR_WALLET_PUBKEY> --url testnet
```

Then confirm balance:

```bash
aeko balance <YOUR_WALLET_PUBKEY> --url testnet
```

## Step 4. Build The Starter Program

From the starter contract directory:

```bash
cd /Users/ok/Documents/projects/aeko-chain/contracts/hello-aeko-program
cargo build-bpf
```

Depending on your AEKO toolchain, the final artifact is expected at:

```bash
target/deploy/hello_aeko_program.so
```

## Step 5. Deploy The Program

Deploy the built program to testnet:

```bash
aeko program deploy target/deploy/hello_aeko_program.so
```

Or from the repo root:

```bash
cargo run --bin aeko -- program deploy contracts/hello-aeko-program/target/deploy/hello_aeko_program.so
```

Record the resulting program id.

Call it:

```bash
AEKO_PROGRAM_ID=<DEPLOYED_PROGRAM_ID>
```

## Step 6. Invoke The Program

The starter includes a host-side Rust example that sends a bare instruction to the deployed program.

From the repo root:

```bash
AEKO_RPC_URL=https://api.testnet.aeko.chain \
AEKO_PROGRAM_ID=<DEPLOYED_PROGRAM_ID> \
AEKO_KEYPAIR_PATH=$HOME/.config/aeko/id.json \
cargo run --manifest-path contracts/hello-aeko-program/Cargo.toml --example invoke_hello -- "hello-from-testnet"
```

What it does:

- loads your deployer keypair
- fetches a recent blockhash
- creates an instruction targeting your deployed program
- signs and submits the transaction
- prints the resulting transaction signature

## Step 7. Verify The Invocation

Capture:

- program id
- payer pubkey
- invoke signature

Then verify the transaction through your explorer or RPC tooling.

If you have an explorer backend live, search the signature there. Otherwise use standard RPC transaction lookup against your testnet endpoint.

## Expected Output

The invoke example should print something like:

```text
rpc url: https://api.testnet.aeko.chain
program id: <DEPLOYED_PROGRAM_ID>
payer: <YOUR_WALLET_PUBKEY>
instruction text: hello-from-testnet
message instructions: 1
invoke signature: <TX_SIGNATURE>
```

## Common Failure Cases

- `dns error`
  - your configured testnet RPC is not reachable from your machine
- `AccountNotFound`
  - the payer wallet is not funded or the program id is wrong
- `Transaction signature verification failure`
  - wrong keypair or corrupted local config
- deploy works but invoke fails
  - check that `AEKO_PROGRAM_ID` matches the deployed program, not the keypair path

## Next Step After First Invoke

Once this works, the next useful upgrade is:

1. add an instruction enum
2. decode instruction bytes in the program
3. add one state account
4. write a client that sends structured data instead of raw bytes

## Related Files

- [`contracts/hello-aeko-program`](/Users/ok/Documents/projects/aeko-chain/contracts/hello-aeko-program)
- [`contracts/hello-aeko-program/examples/invoke_hello.rs`](/Users/ok/Documents/projects/aeko-chain/contracts/hello-aeko-program/examples/invoke_hello.rs)
- [`docs/developer-sdk/write-your-first-program.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/write-your-first-program.md)
