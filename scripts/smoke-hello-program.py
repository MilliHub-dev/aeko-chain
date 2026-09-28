#!/usr/bin/env python3
"""Build-result dogfood for the contracts/hello-aeko-program starter.

The caller is responsible for building the SBF artifact. This script deploys
that exact artifact to the running TestValidator, invokes it with the documented
Rust example, and verifies the confirmed transaction executed the program.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


REPO_ROOT = Path(__file__).resolve().parents[1]
RPC_URL = required_env("AEKO_RPC_URL")
PAYER_KEYPAIR = Path(required_env("AEKO_HELLO_PAYER_KEYPAIR"))
PROGRAM_SO = Path(required_env("AEKO_HELLO_PROGRAM_SO"))
PROGRAM_KEYPAIR = Path(required_env("AEKO_HELLO_PROGRAM_KEYPAIR"))
CLI = REPO_ROOT / "target" / "debug" / "aeko"
KEYGEN = REPO_ROOT / "target" / "debug" / "aeko-keygen"
MANIFEST = REPO_ROOT / "contracts" / "hello-aeko-program" / "Cargo.toml"


def run(args: list[str], *, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(
        args,
        cwd=REPO_ROOT,
        env=env,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if result.stdout:
        print(result.stdout, end="")
    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode,
            args,
            output=result.stdout,
        )
    return result.stdout


def rpc(method: str, params: list | None = None):
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}
    ).encode()
    request = urllib.request.Request(
        RPC_URL,
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(f"RPC {method}: {payload['error']}")
    return payload["result"]


for path in (CLI, KEYGEN, PAYER_KEYPAIR, PROGRAM_SO, PROGRAM_KEYPAIR, MANIFEST):
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f"required Hello World integration artifact is missing: {path}")

program_id = run([str(KEYGEN), "pubkey", str(PROGRAM_KEYPAIR)]).strip().splitlines()[-1]

run(
    [
        str(CLI),
        "--url",
        RPC_URL,
        "--keypair",
        str(PAYER_KEYPAIR),
        "program",
        "deploy",
        str(PROGRAM_SO),
        "--program-id",
        str(PROGRAM_KEYPAIR),
    ]
)

# The Rust developer client submits without an explicit preflight commitment,
# so the RPC default is finalized. Do not invoke a just-deployed program while
# it exists only in the confirmed bank: preflight can legitimately evaluate
# against the finalized bank and report the program as unavailable.
for _ in range(120):
    account = rpc(
        "getAccountInfo",
        [program_id, {"encoding": "base64", "commitment": "finalized"}],
    )["value"]
    if account is not None and account.get("executable") is True:
        break
    time.sleep(0.5)
else:
    raise RuntimeError(
        f"deployed Hello World program {program_id} did not become finalized and executable"
    )

print(f"[ok] deployed Hello World SBF program {program_id}")

invoke_env = os.environ.copy()
invoke_env.update(
    {
        "AEKO_RPC_URL": RPC_URL,
        "AEKO_PROGRAM_ID": program_id,
        "AEKO_KEYPAIR_PATH": str(PAYER_KEYPAIR),
    }
)
invoke_output = run(
    [
        "cargo",
        "run",
        "--locked",
        "--quiet",
        "--manifest-path",
        str(MANIFEST),
        "--example",
        "invoke_hello",
        "--",
        "hello-from-aeko-ci",
    ],
    env=invoke_env,
)

signature = ""
for line in invoke_output.splitlines():
    if line.startswith("invoke signature: "):
        signature = line.removeprefix("invoke signature: ").strip()
if not signature:
    raise RuntimeError("Hello World invoke example did not emit a transaction signature")

transaction = None
for _ in range(120):
    status = rpc(
        "getSignatureStatuses",
        [[signature], {"searchTransactionHistory": True}],
    )["value"][0]
    if status is not None and status.get("err") is not None:
        raise RuntimeError(f"Hello World invocation failed: {status['err']}")
    if status is not None:
        transaction = rpc(
            "getTransaction",
            [
                signature,
                {
                    "encoding": "json",
                    "commitment": "confirmed",
                    "maxSupportedTransactionVersion": 0,
                },
            ],
        )
        if transaction is not None:
            break
    time.sleep(0.5)

if transaction is None:
    raise RuntimeError(
        f"Hello World invocation transaction {signature} was not queryable"
    )

meta = transaction.get("meta") or {}
if meta.get("err") is not None:
    raise RuntimeError(f"Hello World invocation transaction failed: {meta['err']}")

logs = meta.get("logMessages") or []
if not any("Hello from AEKO!" in line for line in logs):
    raise RuntimeError(
        "Hello World invocation confirmed but expected program log was absent: "
        + repr(logs)
    )

message = transaction.get("transaction", {}).get("message", {})
account_keys = message.get("accountKeys") or []
if program_id not in account_keys:
    raise RuntimeError(
        f"Hello World program id {program_id} is absent from invocation account keys"
    )

print(
    f"[ok] invoked Hello World program {program_id}; transaction {signature} "
    "confirmed and emitted the expected program log"
)
