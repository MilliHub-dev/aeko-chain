# CLI Tools

The AEKO Command Line Interface (CLI) is essential for developers and validators.

## Installation

```bash
sh -c "$(curl -sSfL https://release.aeko.chain/install)"
```

## Common Commands

### Wallet Management
*   `aeko-keygen new`: Create a new wallet.
*   `aeko balance`: Check current balance.
*   `aeko transfer <RECIPIENT> <AMOUNT>`: Send tokens.

### Cluster Configuration
*   `aeko config set --url devnet`: Switch to Devnet.
*   `aeko config set --url mainnet-beta`: Switch to Mainnet.

### Program Deployment
*   `aeko program deploy <PATH>`: Deploy a smart contract.
*   `aeko program close <PROGRAM_ID>`: Close a program and reclaim rent.
