# CLI Tools

The AEKO Command Line Interface (CLI) is essential for developers and validator operators. For normal wallet/RPC work, install the small prebuilt CLI bundle rather than compiling the full chain workspace locally.

## Fast installation

### Linux x86_64 (glibc)

```bash
curl -fsSL https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.sh | sh
```

### Windows x86_64 / PowerShell

```powershell
irm https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.ps1 | iex
```

Both installers download the release-built `aeko` and `aeko-keygen` binaries, verify the published SHA-256 checksum, install them into the current user's environment, and verify both commands can execute. The commands become publicly usable after a tagged `v*` GitHub Release publishes the matching CLI assets.

See [`../../install/README.md`](../../install/README.md) for version pinning, install-directory overrides, supported targets, and release details.

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
