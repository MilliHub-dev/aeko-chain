# Fast AEKO CLI install

The fast installer downloads **prebuilt** `aeko` and `aeko-keygen` binaries from the latest AEKO GitHub Release. It does not clone the repository or compile the Rust workspace on the user's machine.

The one-line installers become usable after the first tagged `v*` release publishes the CLI assets. Pull-request workflow artifacts validate the binaries before that release, but are not used by the public installer.

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
