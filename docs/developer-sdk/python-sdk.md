# Python SDK

The Python SDK is intended for scripting, analytics, monitoring, governance tooling, and internal operational automation on AEKO Chain.

## Current Repo Status

- the in-repo Python SDK scaffold now lives in [`sdk/python`](/Users/ok/Documents/projects/aeko-chain/sdk/python)
- it currently covers:
  - JSON-RPC access through `AekoClient`
  - blockhash, balance, account, and program-account queries
  - raw transaction submission
  - signature status polling helpers
  - AEKO-721 account decoders and instruction builders
  - wallet-permissions account decoder and instruction builders
- it is currently stdlib-only, which keeps it lightweight for ops and automation use
- it is now published to PyPI as `aeko-sdk==0.1.0`

## Use Cases

- analytics
- bots
- monitoring
- AI agents
- governance scripts
- internal operations tooling

## Installation

```bash
pip install aeko-sdk
```

For local repo development:

```bash
pip install -e sdk/python
```

## Example

```python
from aeko_sdk import AekoClient

client = AekoClient("https://api.testnet.aeko.chain")
blockhash = client.get_latest_blockhash()
print(blockhash)
```

See:

- [`sdk/python/examples/basic_usage.py`](/Users/ok/Documents/projects/aeko-chain/sdk/python/examples/basic_usage.py)
- [`sdk/python/examples/account_watch.py`](/Users/ok/Documents/projects/aeko-chain/sdk/python/examples/account_watch.py)
