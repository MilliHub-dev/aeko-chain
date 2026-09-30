# Fast AEKO CLI install

The fast installer downloads **prebuilt** `aeko` and `aeko-keygen` binaries from the latest AEKO GitHub Release. It does not clone the repository or compile the Rust workspace on the user's machine.

The one-line installers consume the latest GitHub Release. Every successful `AEKO DevOps (single runner)` push to `main` publishes a traceable `cli-main-<12-character-commit>` release from the exact validated commit. Explicit `v*` tags remain available for operator-managed versioned releases. Pull-request workflow artifacts validate binaries but are not used by the public installer.

## Linux x86_64 (glibc)

```bash
curl -fsSL https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.sh | sh
```

The default install directory is `~/.local/bin`. To use another directory:

```bash
curl -fsSL https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.sh \
  | AEKO_INSTALL_DIR="$HOME/bin" sh
```

To install a specific release instead of the latest release:

```bash
curl -fsSL https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.sh \
  | AEKO_VERSION=v2.0.0 sh
```

## Windows x86_64 / PowerShell

```powershell
irm https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.ps1 | iex
```

The default install directory is `%LOCALAPPDATA%\Aeko\bin`. The PowerShell installer adds that directory to the current process and the user's PATH when needed.

To pin a release:

```powershell
$env:AEKO_VERSION = 'v2.0.0'
irm https://raw.githubusercontent.com/MilliHub-dev/aeko-chain/main/install/aeko-cli-install.ps1 | iex
```

## What gets installed

Only these end-user/operator binaries:

```text
aeko
aeko-keygen
```

Use the Docker images or existing full installer path when you need the validator, faucet, genesis, SBF tooling, or the complete operator toolchain.

## Integrity

Every CLI archive is published with a `.sha256` sidecar. Both installers verify SHA-256 before placing any executable in the install directory, then verify both installed binaries can execute `--version` before reporting success.

The release workflow builds binaries on their native GitHub-hosted operating systems for:

```text
x86_64-unknown-linux-gnu  # glibc Linux
x86_64-pc-windows-msvc
```

Other CPU architectures are intentionally rejected until matching release artifacts are built and validated.

## Updating

The installed `aeko` binary can check and apply the same checksum-verified GitHub Release bundle used by the fast installers:

```text
aeko update --check
aeko update
```

`aeko update` shows the current and latest release and asks before installing. Use `aeko update --yes` for non-interactive automation and `aeko update --force` to reinstall the latest release when the current binary predates source-commit stamping.

For interactive terminals, AEKO performs a non-fatal update check at most once every 24 hours. When a newer release is detected it offers to update after the requested command finishes. Set `AEKO_NO_UPDATE_CHECK=1` to disable that notice. Update-check failures never make normal wallet/RPC commands fail.

On Windows, self-update launches Windows PowerShell to stage the new checksum-verified binaries and waits for the running `aeko.exe` process to exit before replacement. The public installer is runtime-tested with Windows PowerShell 5.1 as well as the release binary itself.
