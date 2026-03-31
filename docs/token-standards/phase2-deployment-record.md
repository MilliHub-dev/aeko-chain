# Phase 2 Deployment Record

Status: Fill during live testnet deployment

Use this document as the single source of truth for the final Phase 2 deployment values and verification artifacts.

## Environment

- deployment date:
- operator:
- testnet RPC:
- AEKO CLI version:
- deployer wallet:
- upgrade authority:

## Program IDs

### Tokenomics

- program id:
- deploy tx:
- initialize tx:
- config state account:

### AEKO-20

- program id:
- deploy tx:
- mint state account:
- initialize mint tx:

### Public Mint

- program id:
- deploy tx:
- policy state account:
- initialize policy tx:

### AEKO-721

- program id:
- deploy tx:

## Canonical AEKO-721 Public Example

- collection address:
- token address:
- collection seed: `aeko-genesis-collection`
- token seed: `aeko-genesis-token-1`
- collection setup tx:
- first mint tx:

## Verification Transactions

- tokenomics read/config verification:
- AEKO-20 mint verification:
- AEKO-20 transfer verification:
- AEKO-20 burn verification:
- public mint verification:
- AEKO-721 live-read verification:
- AEKO-721 wallet sign-and-send verification:

## Web Demo Values

```bash
VITE_AEKO_TESTNET_RPC=
VITE_AEKO_DEMO_RPC=
VITE_AEKO_DEMO_COLLECTION=
VITE_AEKO_DEMO_TOKEN=
VITE_AEKO_DEMO_COLLECTION_SEED=aeko-genesis-collection
VITE_AEKO_DEMO_TOKEN_SEED=aeko-genesis-token-1
```

## Final Closeout

- [ ] AEKO-20 deployed to testnet
- [ ] tokenomics/public mint deployed to testnet
- [ ] canonical AEKO-721 public example published
- [ ] web demo updated with live canonical addresses
- [ ] Phase 2 tracker updated to mark both remaining items complete
