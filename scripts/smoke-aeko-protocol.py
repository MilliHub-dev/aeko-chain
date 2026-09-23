#!/usr/bin/env python3
"""Read-only end-to-end acceptance for AEKO protocol activation/bootstrap."""

from __future__ import annotations

import base64
import json
import os
import struct
import time
import urllib.request

RPC = os.environ.get("AEKO_RPC_URL", "http://127.0.0.1:8899").rstrip("/")
API = os.environ.get("AEKO_EXPLORER_API_URL", "http://127.0.0.1:8088").rstrip("/")
FEATURE_OWNER = "Feature111111111111111111111111111111111111"
SYSTEM_OWNER = "11111111111111111111111111111111"

STATE_PROGRAM = {
    "tokenomics": "tokenomics",
    "referenceMint": "token20",
    "publicMint": "publicMint",
    "permissionRegistry": "permissionRegistry",
    "revocationRegistry": "revocationRegistry",
    "subnetRegistry": "subnetRegistry",
    "emergencyMultisig": "emergencyMultisig",
    "finalityOracle": "finalityOracle",
}


def rpc(method: str, params=None):
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}
    ).encode()
    req = urllib.request.Request(
        RPC, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(f"{method}: {payload['error']}")
    return payload.get("result")


def api(path: str):
    with urllib.request.urlopen(f"{API}{path}", timeout=15) as response:
        payload = json.load(response)
    return payload["data"]


def account(address: str):
    result = rpc(
        "getAccountInfo",
        [address, {"encoding": "base64", "commitment": "confirmed"}],
    )
    return result["value"]


def require_account(
    address: str,
    *,
    owner: str | None = None,
    executable: bool | None = None,
    require_data: bool = False,
):
    value = account(address)
    if value is None:
        raise RuntimeError(f"account missing: {address}")
    if owner is not None and value["owner"] != owner:
        raise RuntimeError(f"{address}: owner {value['owner']} != {owner}")
    if executable is not None and bool(value["executable"]) != executable:
        raise RuntimeError(
            f"{address}: executable={value['executable']} expected {executable}"
        )
    raw = base64.b64decode(value["data"][0])
    if require_data and not raw:
        raise RuntimeError(f"{address}: expected non-empty account data")
    return value, raw


def feature_slot(address: str) -> int:
    _, raw = require_account(address, owner=FEATURE_OWNER, executable=False, require_data=True)
    if len(raw) != 9:
        raise RuntimeError(f"{address}: feature account data length {len(raw)} != 9")
    if raw[0] != 1:
        raise RuntimeError(f"{address}: feature is still pending, option tag={raw[0]}")
    return struct.unpack("<Q", raw[1:9])[0]


def main() -> int:
    if rpc("getHealth") != "ok":
        raise RuntimeError("validator getHealth is not ok")

    slot_a = int(rpc("getSlot"))
    time.sleep(1.0)
    slot_b = int(rpc("getSlot"))
    if slot_b <= slot_a:
        raise RuntimeError(f"validator slot did not advance: {slot_a} -> {slot_b}")

    registry = api("/registry/protocol")
    if not registry.get("complete"):
        raise RuntimeError(f"protocol registry incomplete: {registry}")

    status = api("/protocol/status")
    if not status.get("complete"):
        raise RuntimeError(f"protocol live status incomplete: {status}")

    token_slot = feature_slot(registry["tokenProgramsFeature"])
    permission_slot = feature_slot(registry["permissionLayerFeature"])
    if token_slot != int(registry["tokenProgramsFeatureActivatedAt"]):
        raise RuntimeError("token feature activation slot disagrees with registry")
    if permission_slot != int(registry["permissionLayerFeatureActivatedAt"]):
        raise RuntimeError("permission feature activation slot disagrees with registry")

    programs = registry["programs"]
    if len(programs) != 11:
        raise RuntimeError(f"expected 11 protocol programs, got {len(programs)}")
    for label, program_id in programs.items():
        require_account(program_id, executable=True)
        print(f"[ok] executable program {label}: {program_id}")

    states = registry["states"]
    if len(states) != 8:
        raise RuntimeError(f"expected 8 canonical protocol states, got {len(states)}")
    for label, address in states.items():
        program_label = STATE_PROGRAM[label]
        require_account(
            address,
            owner=programs[program_label],
            executable=False,
            require_data=True,
        )
        print(f"[ok] canonical state {label}: {address}")

    accounts = registry["accounts"]
    if len(accounts) != 3:
        raise RuntimeError(f"expected 3 protocol custody accounts, got {len(accounts)}")
    for label, address in accounts.items():
        value, raw = require_account(address, owner=SYSTEM_OWNER, executable=False)
        if raw:
            raise RuntimeError(f"{label}: custody account must remain zero-data")
        if int(value["lamports"]) <= 0:
            raise RuntimeError(f"{label}: custody account is not rent-funded")
        print(f"[ok] custody account {label}: {address}")

    print(
        f"[PASS] protocol active and integrated; slot {slot_a} -> {slot_b}; "
        f"feature slots token={token_slot} permission={permission_slot}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
