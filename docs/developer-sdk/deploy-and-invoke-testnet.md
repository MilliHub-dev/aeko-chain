# Deploy And Invoke On Testnet

This guide takes an external developer from zero to first live AEKO program invocation on testnet.

It uses the minimal starter at:

- [`contracts/hello-aeko-program`](../../contracts/hello-aeko-program/)

And the invoke example at:

- [`contracts/hello-aeko-program/examples/invoke_hello.rs`](../../contracts/hello-aeko-program/examples/invoke_hello.rs)

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

- [`cli-tools.md`](./cli-tools.md)
- [`write-your-first-program.md`](./write-your-first-program.md)

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
aeko config set --url https://rpc.aeko.online
```

Repo-binary alternative:

```bash
cargo run --bin aeko -- config set --url https://rpc.aeko.online
```

## Step 3. Fund The Wallet

Use the wallet public key from your keypair and submit a policy-controlled funding request:

```bash
curl -X POST https://scan.aeko.online/api/explorer/testnet/funding/request \
  -H 'Content-Type: application/json' \
  -d '{"address":"<YOUR_WALLET_PUBKEY>"}'
```

The public request is queued for operator approval. Operations Web authenticates the operator decision and forwards it to the active Explorer backend. The Explorer backend owns settlement: it submits the approved policy amount through the Validator's protected low-level `requestAirdrop` path, and the Validator obtains the signed transfer from the Faucet.

The public testnet does not expose browser/CLI direct airdrops as the managed funding path. The `aeko airdrop` command is appropriate only for local/custom test validators that are explicitly configured without the managed funding authorization requirement.

Use the request id returned above to check settlement status:

```bash
curl https://scan.aeko.online/api/explorer/testnet/funding/request/<REQUEST_ID>
```

Then confirm balance:

```bash
aeko balance <YOUR_WALLET_PUBKEY> --url testnet
```

## Step 4. Build The Starter Program

From the repository root, use the repository's AEKO SBF wrapper. This is the
same build path exercised by the dedicated smart-contract CI lane:

```bash
./cargo-build-sbf \
  --manifest-path contracts/hello-aeko-program/Cargo.toml \
  --sbf-out-dir contracts/hello-aeko-program/target/deploy
```

The build must produce both the deployable program and its generated program-id
keypair:

```text
contracts/hello-aeko-program/target/deploy/hello_aeko_program.so
contracts/hello-aeko-program/target/deploy/hello_aeko_program-keypair.json
```

Do not substitute a normal host `cargo build`; that does not produce an AEKO
SBF program artifact.

## Step 5. Deploy The Program

Deploy the built program to testnet:

```bash
aeko program deploy contracts/hello-aeko-program/target/deploy/hello_aeko_program.so
```

Or from the repo root:

```bash
cargo run -p aeko-cli --bin aeko -- \
  program deploy contracts/hello-aeko-program/target/deploy/hello_aeko_program.so
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
AEKO_RPC_URL=https://rpc.aeko.online \
AEKO_PROGRAM_ID=<DEPLOYED_PROGRAM_ID> \
AEKO_KEYPAIR_PATH=$HOME/.config/aeko/id.json \
cargo run --locked --manifest-path contracts/hello-aeko-program/Cargo.toml --example invoke_hello -- "hello-from-testnet"
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

A successful upload alone is not enough. The invocation transaction must have
`meta.err = null`, and its logs should include `Hello from AEKO!`.

## Repository CI Acceptance

The dedicated `Smart contracts (SBF → AEKO SVM)` job runs this same starter
against a real isolated `aeko-test-validator`:

```text
contracts/hello-aeko-program
  -> cargo-build-sbf
  -> aeko program deploy
  -> executable on-chain program account
  -> examples/invoke_hello.rs
  -> confirmed transaction
  -> "Hello from AEKO!" program log
```

The job is implemented by
[`.github/actions/devops/smart-contracts/run.sh`](../../.github/actions/devops/smart-contracts/run.sh)
and delegates the deployment/invocation assertions to
[`scripts/smoke-hello-program.py`](../../scripts/smoke-hello-program.py).
This CI test uses an isolated TestValidator; it does not deploy the starter to
the public testnet automatically.

## Expected Output

The invoke example should print something like:

```text
rpc url: https://rpc.aeko.online
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

- [`contracts/hello-aeko-program`](../../contracts/hello-aeko-program/)
- [`contracts/hello-aeko-program/examples/invoke_hello.rs`](../../contracts/hello-aeko-program/examples/invoke_hello.rs)
- [`write-your-first-program.md`](./write-your-first-program.md)
