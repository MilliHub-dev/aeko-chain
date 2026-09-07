#!/usr/bin/env python3
"""Smoke-test the deployed AEKO network and SocialFi read path.

This intentionally uses only the Python standard library. It proves deployment
wiring and on-chain SocialFi state ownership; it does not fabricate a signed
post transaction. Use the Explorer/Faucet test console for the write-path test.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any

RPC_URL = os.environ.get("AEKO_RPC_URL", "http://127.0.0.1:8899").rstrip("/")
EXPLORER_API_URL = os.environ.get(
    "AEKO_EXPLORER_API_URL", "http://127.0.0.1:8088"
).rstrip("/")
TIMEOUT = float(os.environ.get("AEKO_SMOKE_TIMEOUT_SECS", "10"))
SLOT_WAIT_SECS = float(os.environ.get("AEKO_SMOKE_SLOT_WAIT_SECS", "20"))

PROGRAM_FILL_BYTES = {
    "posts": 17,
    "rewards": 13,
    "staking": 14,
    "antiSpam": 16,
    "monetization": 15,
}

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


class SmokeFailure(RuntimeError):
    pass


def base58_encode(data: bytes) -> str:
    value = int.from_bytes(data, "big")
    encoded = ""
    while value:
        value, remainder = divmod(value, 58)
        encoded = BASE58_ALPHABET[remainder] + encoded
    leading_zeroes = len(data) - len(data.lstrip(b"\x00"))
    return (BASE58_ALPHABET[0] * leading_zeroes) + (encoded or "")


def request_json(url: str, *, payload: dict[str, Any] | None = None) -> Any:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method="POST" if body else "GET")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            content_type = response.headers.get("Content-Type", "")
            raw = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise SmokeFailure(f"{url} returned HTTP {exc.code}: {detail}") from exc
    except OSError as exc:
        raise SmokeFailure(f"cannot reach {url}: {exc}") from exc

    if "json" not in content_type.lower():
        preview = raw.decode("utf-8", "replace")[:300]
        raise SmokeFailure(f"{url} did not return JSON ({content_type!r}): {preview}")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SmokeFailure(f"{url} returned invalid JSON") from exc


def rpc(method: str, params: list[Any] | None = None) -> Any:
    body = request_json(
        RPC_URL,
        payload={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []},
    )
    if body.get("error"):
        raise SmokeFailure(f"RPC {method} failed: {body['error']}")
    if "result" not in body:
        raise SmokeFailure(f"RPC {method} response has no result: {body}")
    return body["result"]


def explorer(path: str) -> Any:
    return request_json(f"{EXPLORER_API_URL}{path}")


def data_envelope(body: Any) -> Any:
    return body.get("data", body) if isinstance(body, dict) else body


def check_health() -> None:
    result = rpc("getHealth")
    if result != "ok":
        raise SmokeFailure(f"RPC health expected 'ok', got {result!r}")
    print("[ok] validator RPC getHealth=ok")


def check_slot_advances() -> None:
    first = int(rpc("getSlot"))
    deadline = time.monotonic() + SLOT_WAIT_SECS
    current = first
    while time.monotonic() < deadline:
        time.sleep(1)
        current = int(rpc("getSlot"))
        if current > first:
            print(f"[ok] chain advances: slot {first} -> {current}")
            return
    raise SmokeFailure(f"getSlot did not advance from {first} within {SLOT_WAIT_SECS:g}s")


def check_explorer_health() -> None:
    body = data_envelope(explorer("/health"))
    if isinstance(body, dict) and body.get("ok") is False:
        raise SmokeFailure(f"Explorer health is not ok: {body}")
    print("[ok] Explorer API /health returns JSON")


def check_social_registry() -> dict[str, str]:
    registry = data_envelope(explorer("/registry/social"))
    if not isinstance(registry, dict):
        raise SmokeFailure(f"Social registry has unexpected shape: {registry!r}")
    if registry.get("complete") is not True:
        raise SmokeFailure(f"Social registry is incomplete: {registry}")

    resolved: dict[str, str] = {}
    for key in PROGRAM_FILL_BYTES:
        value = registry.get(key)
        if not isinstance(value, str) or not value.strip():
            raise SmokeFailure(f"Social registry missing {key}: {registry}")
        resolved[key] = value.strip()
    print("[ok] /registry/social complete=true with all five SocialFi state accounts")
    return resolved


def check_state_owners(registry: dict[str, str]) -> None:
    for key, fill in PROGRAM_FILL_BYTES.items():
        expected_owner = base58_encode(bytes([fill]) * 32)
        result = rpc(
            "getAccountInfo",
            [registry[key], {"commitment": "confirmed", "encoding": "base64"}],
        )
        value = result.get("value") if isinstance(result, dict) else None
        if not isinstance(value, dict):
            raise SmokeFailure(f"{key} state account {registry[key]} does not exist")
        owner = value.get("owner")
        if owner != expected_owner:
            raise SmokeFailure(
                f"{key} state owner mismatch: expected {expected_owner}, got {owner}"
            )
        data = value.get("data")
        if not isinstance(data, list) or not data or not data[0]:
            raise SmokeFailure(f"{key} state account has no readable data")
        try:
            raw_state = base64.b64decode(data[0], validate=True)
        except (ValueError, TypeError) as exc:
            raise SmokeFailure(f"{key} state account data is not valid base64") from exc
        if not raw_state or raw_state[0] != 1:
            raise SmokeFailure(f"{key} state account is not marked initialized")
        print(f"[ok] {key} state exists, initialized, and is owned by {expected_owner}")


def check_explorer_social_reads() -> None:
    posts = explorer("/posts?limit=1")
    if not isinstance(posts, dict):
        raise SmokeFailure(f"/posts returned unexpected shape: {posts!r}")
    engagement = explorer("/engagement?limit=1")
    if not isinstance(engagement, dict):
        raise SmokeFailure(f"/engagement returned unexpected shape: {engagement!r}")
    stakes = explorer("/stakes?limit=1")
    if not isinstance(stakes, dict):
        raise SmokeFailure(f"/stakes returned unexpected shape: {stakes!r}")
    print("[ok] Explorer SocialFi read endpoints respond: /posts, /engagement, /stakes")


def main() -> int:
    print(f"AEKO RPC: {RPC_URL}")
    print(f"Explorer API: {EXPLORER_API_URL}")
    try:
        check_health()
        check_slot_advances()
        check_explorer_health()
        registry = check_social_registry()
        check_state_owners(registry)
        check_explorer_social_reads()
    except SmokeFailure as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1

    print("[PASS] AEKO deployment and SocialFi read path are wired correctly")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
