# AEKO Python SDK

`aeko-sdk` is the Python SDK for AEKO Chain scripting, automation, analytics, and operational tooling.

Current scope:

- JSON-RPC connection wrapper
- account and balance queries
- transaction submit and signature status queries
- AEKO-721 account decoders and instruction builders
- wallet-permissions account decoder and instruction builders
- lightweight helpers for analytics and monitoring scripts

Examples:

- [`examples/basic_usage.py`](/Users/ok/Documents/projects/aeko-chain/sdk/python/examples/basic_usage.py)
- [`examples/account_watch.py`](/Users/ok/Documents/projects/aeko-chain/sdk/python/examples/account_watch.py)

## Local Verification

```bash
python3 -m compileall sdk/python/src sdk/python/examples
```

## Local Install

```bash
pip install -e sdk/python
```
