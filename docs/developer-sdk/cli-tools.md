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

Both installers download the release-built `aeko` and `aeko-keygen` binaries, verify the published SHA-256 checksum, install them into the current user's environment, and verify both commands can execute. Successful main-branch validation publishes a traceable `cli-main-<commit>` release; operator-managed `v*` releases remain supported.

See [`../../install/README.md`](../../install/README.md) for version pinning, install-directory overrides, supported targets, integrity details, and self-update behavior.

## AEKO quick start

Configure the public testnet directly, create a wallet if needed, then inspect the live chain:

```bash
aeko config set --url https://rpc.aeko.online
aeko-keygen new
aeko balance
aeko slot
aeko genesis-hash
aeko validators
aeko gossip
```

Common public endpoints are:

```text
RPC       https://rpc.aeko.online
WebSocket wss://ws.aeko.online
Explorer  https://scan.aeko.online
API       https://api.aeko.online
```

The CLI intentionally exposes implemented AEKO chain primitives such as wallet transfers, staking, validator/cluster inspection and program deployment. Native SocialFi, AEKO-20/AEKO-721 and application-specific flows should use the documented program/SDK interfaces until dedicated CLI commands are implemented; the CLI does not advertise placeholder commands that are not wired to those contracts.

## Updating the CLI

```bash
aeko update --check
aeko update
```

`aeko update` checks the repository's latest published CLI release, displays the current and target versions, and asks before installing. `--yes` supports non-interactive updates; `--force` reinstalls the latest release when source comparison is unavailable. Interactive commands also perform a cached, non-fatal daily update check and can offer the update after command completion. Set `AEKO_NO_UPDATE_CHECK=1` to disable the notice.

## Common Commands

### Wallet and Testnet Funding
*   `aeko-keygen new`: Create a new wallet.
*   `aeko balance`: Check current balance.
*   `aeko transfer <RECIPIENT> <AMOUNT>`: Send AEKO.
*   `aeko airdrop <AMOUNT>`: Request the instant developer Testnet airdrop.
*   `aeko funding <AMOUNT>`: Submit an approval-gated Testnet funding request through the Explorer API.

### Network Configuration and Inspection
*   `aeko config set --url https://rpc.aeko.online`: Use the public AEKO Testnet RPC.
*   `aeko config set --url localhost`: Use a local validator on `http://localhost:8899`.
*   `aeko genesis-hash`: Read the active chain genesis hash.
*   `aeko slot`: Read the current slot.
*   `aeko validators`: Inspect validator state.
*   `aeko gossip`: Inspect gossip-visible nodes.

Mainnet and Devnet monikers are intentionally not hardcoded until those deployments have canonical endpoints. For either network, provide its explicit RPC URL when provisioned.

### Program Deployment
*   `aeko program deploy <PATH>`: Deploy an on-chain program (smart contract).
*   `aeko program close <PROGRAM_ID>`: Close a program and reclaim rent.
