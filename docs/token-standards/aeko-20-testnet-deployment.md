# AEKO-20 Testnet Deployment Checklist

Status: Ready for operator execution

This document defines the remaining work to close the `Deploy AEKO-20 reference implementation to testnet` item in Phase 2.

## Goal

Deploy the AEKO-20 reference program and its dependent tokenomics/public-mint components to AEKO testnet, then verify the published program ids and core flows.

## Programs In Scope

- [`programs/tokenomics`](/Users/ok/Documents/projects/aeko-chain/programs/tokenomics)
- [`programs/token-20`](/Users/ok/Documents/projects/aeko-chain/programs/token-20)
- [`programs/public-mint`](/Users/ok/Documents/projects/aeko-chain/programs/public-mint)

## Prerequisites

- AEKO CLI installed and configured for testnet
- deployer keypair funded on testnet
- program upgrade authority keypair decided and secured
- pinned build toolchain available
- testnet RPC reachable

Reference docs:

- [`docs/developer-sdk/cli-tools.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/cli-tools.md)
- [`docs/rebrand-phase2-status.md`](/Users/ok/Documents/projects/aeko-chain/docs/rebrand-phase2-status.md)
- [`tokenomics.md`](/Users/ok/Documents/projects/aeko-chain/tokenomics.md)

## Pre-Deployment Checks

1. Confirm Phase 2 tokenomics values are still the intended deployment values.
2. Run targeted checks for the Phase 2 crates:
   - `cargo check -p aeko-tokenomics-program`
   - `cargo check -p aeko-token-20-program`
   - `cargo check -p aeko-public-mint-program`
3. Run focused tests where available.
4. Confirm the intended program ids and authorities for:
   - tokenomics
   - AEKO-20
   - public mint
5. Confirm testnet wallet funding for:
   - deploy fees
   - initial account initialization transactions

## Build Artifacts

Build the deployable program artifacts with the project’s SBF flow.

Operator note:

- use the repo’s normal SBF build path for on-chain deployables
- keep the generated `.so` artifacts and program keypairs with the deployment record

## Deployment Order

Deploy in this order:

1. Tokenomics program
2. AEKO-20 program
3. Public mint program

Reason:

- AEKO-20 mint policy depends on tokenomics state
- public mint delegates issuance into AEKO-20

## Suggested Deployment Commands

Use AEKO CLI program deployment flow:

```bash
aeko config set --url https://api.testnet.aeko.chain
aeko program deploy <PATH_TO_SO> --program-id <PROGRAM_KEYPAIR>
```

Use the same command shape for each deployed program.

## Post-Deployment Initialization

After deploy, run initialization transactions for:

1. tokenomics global state
2. tokenomics governance authority
3. AEKO-20 mint state
4. public mint policy state

Record:

- deployed program ids
- transaction signatures
- authority addresses
- initialized state account addresses

## Functional Verification

Verify the following on testnet:

### Tokenomics

- initialize account succeeds
- read config returns expected signed-off values
- governance-gated update rejects unauthorized signers

### AEKO-20

- initialize mint succeeds
- initialize account succeeds
- mint authority path works as expected
- transfer works
- burn works
- approve / transferFrom works
- freeze / thaw works

### Public Mint

- allowlist and blocklist updates work
- rate limiting rejects excess mint attempts
- public mint delegates into AEKO-20 only through the guarded path

## Required Deployment Record

Publish or store the following:

- tokenomics program id
- AEKO-20 program id
- public mint program id
- initialization tx signatures
- authority model summary
- testnet RPC used
- deployment date

## Completion Criteria

This checklist is complete when:

- all three programs are deployed on testnet
- initialization transactions are confirmed
- core AEKO-20 and public mint flows are verified on testnet
- deployed program ids are recorded in project docs or operator records

