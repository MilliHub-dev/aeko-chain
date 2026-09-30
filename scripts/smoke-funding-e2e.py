#!/usr/bin/env python3
"""Destructive end-to-end smoke test for AEKO test-network funding.

This test uses the same product boundaries as a real user/operator flow:
Aeko Scan public request -> Operations Web Admin approval -> Explorer backend
settlement -> protected Validator requestAirdrop -> Faucet -> chain confirmation
-> public request status -> Admin funding history -> RPC balance.

It intentionally does not test developer Test Console airdrops. Airdrops are a
separate workflow and ledger.

Required environment:
  AEKO_NETWORK=testnet|devnet|localnet
  AEKO_SCAN_URL=https://scan.example
  AEKO_OPERATIONS_URL=https://admin.example
  AEKO_RPC_URL=https://rpc.example
  AEKO_FUNDING_SMOKE_ADDRESS=<dedicated wallet address>
  ADMIN_PASSWORD=<Operations Web password>

Use a dedicated wallet. The test moves real test-network AEKO.
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

TIMEOUT = float(os.environ.get("AEKO_FUNDING_SMOKE_TIMEOUT_SECS", "30"))
POLL_SECONDS = float(os.environ.get("AEKO_FUNDING_SMOKE_POLL_SECS", "2"))
POLL_ATTEMPTS = int(os.environ.get("AEKO_FUNDING_SMOKE_POLL_ATTEMPTS", "30"))
LAMPORTS_PER_AEKO = Decimal("1000000000")


class SmokeFailure(RuntimeError):
    pass


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SmokeFailure(f"{name} is required")
    return value.rstrip("/") if name.endswith("_URL") else value


NETWORK = os.environ.get("AEKO_NETWORK", "").strip().lower()
SCAN_URL = os.environ.get("AEKO_SCAN_URL", "").strip().rstrip("/")
OPERATIONS_URL = os.environ.get("AEKO_OPERATIONS_URL", "").strip().rstrip("/")
RPC_URL = os.environ.get("AEKO_RPC_URL", "").strip().rstrip("/")
ADDRESS = os.environ.get("AEKO_FUNDING_SMOKE_ADDRESS", "").strip()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

COOKIE_JAR = http.cookiejar.CookieJar()
ADMIN_OPENER = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(COOKIE_JAR)
)


def decode_json(response: Any, url: str) -> Any:
    content_type = response.headers.get("Content-Type", "")
    raw = response.read()
    if "json" not in content_type.lower():
        preview = raw.decode("utf-8", "replace")[:300]
        raise SmokeFailure(
            f"{url} returned non-JSON content {content_type!r}: {preview}"
        )
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SmokeFailure(f"{url} returned invalid JSON") from exc


def http_json(
    url: str,
    *,
    payload: dict[str, Any] | None = None,
    opener: Any | None = None,
    expected_status: int = 200,
) -> Any:
    body = None
    headers = {"Accept": "application/json"}
    method = "GET"
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"

    request = urllib.request.Request(
        url,
        data=body,
        headers=headers,
        method=method,
    )
    client = opener or urllib.request
    try:
        with client.open(request, timeout=TIMEOUT) as response:
            if response.status != expected_status:
                raise SmokeFailure(
                    f"{url} returned HTTP {response.status}, expected {expected_status}"
                )
            return decode_json(response, url)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:800]
        content_type = exc.headers.get("Content-Type", "unknown")
        request_id = (
            exc.headers.get("X-Request-Id")
            or exc.headers.get("CF-Ray")
            or "unavailable"
        )
        raise SmokeFailure(
            f"{url} returned HTTP {exc.code} with {content_type}; "
            f"request-id={request_id}: {detail}"
        ) from exc
    except OSError as exc:
        raise SmokeFailure(f"cannot reach {url}: {exc}") from exc


def envelope_data(payload: Any) -> Any:
    if not isinstance(payload, dict) or "data" not in payload:
        raise SmokeFailure(f"expected data envelope, got {payload!r}")
    return payload["data"]


def rpc(method: str, params: list[Any] | None = None) -> Any:
    payload = http_json(
        RPC_URL,
        payload={
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or [],
        },
    )
    if not isinstance(payload, dict):
        raise SmokeFailure(f"RPC {method} returned unexpected payload: {payload!r}")
    if payload.get("error"):
        raise SmokeFailure(f"RPC {method} failed: {payload['error']}")
    if "result" not in payload:
        raise SmokeFailure(f"RPC {method} response has no result: {payload!r}")
    return payload["result"]


def balance(address: str) -> int:
    result = rpc("getBalance", [address, {"commitment": "confirmed"}])
    if isinstance(result, dict):
        result = result.get("value")
    return int(result)


def funding_url(path: str) -> str:
    return f"{SCAN_URL}/api/explorer/{NETWORK}/funding{path}"


def admin_url(path: str) -> str:
    return f"{OPERATIONS_URL}{path}"


def login_admin() -> None:
    http_json(
        admin_url("/api/login"),
        payload={"password": ADMIN_PASSWORD},
        opener=ADMIN_OPENER,
    )
    if not any(cookie.name == "aeko_admin" for cookie in COOKIE_JAR):
        raise SmokeFailure("Operations Web login did not issue the aeko_admin session cookie")
    print("[ok] authenticated to Operations Web")


def ensure_scan_cannot_decide_funding(request_id: str) -> None:
    url = (
        f"{SCAN_URL}/api/explorer/{NETWORK}/admin/funding/requests/"
        f"{request_id}/decide"
    )
    request = urllib.request.Request(
        url,
        data=json.dumps({"approved": True}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=TIMEOUT)
    except urllib.error.HTTPError as exc:
        if exc.code not in (403, 404, 405):
            detail = exc.read().decode("utf-8", "replace")[:500]
            raise SmokeFailure(
                f"Scan funding-decision path failed with unexpected HTTP {exc.code}: {detail}"
            ) from exc
        print(f"[ok] Scan cannot approve funding (HTTP {exc.code})")
        return
    raise SmokeFailure("Scan unexpectedly accepted an Admin funding-decision request")


def approve_from_admin(request_id: str) -> dict[str, Any]:
    payload = http_json(
        admin_url("/api/admin/funding/requests"),
        payload={"id": request_id, "action": "approve"},
        opener=ADMIN_OPENER,
    )
    data = envelope_data(payload)
    if not isinstance(data, dict):
        raise SmokeFailure(f"Admin approval returned unexpected data: {data!r}")
    status = str(data.get("status", ""))
    if status not in {"submitted", "confirmed"}:
        raise SmokeFailure(
            f"Admin approval expected submitted/confirmed status, got {status!r}: {data}"
        )
    print(f"[ok] Admin approved funding; backend status={status}")
    return data


def wait_for_terminal(request_id: str) -> dict[str, Any]:
    last: dict[str, Any] | None = None
    for _ in range(POLL_ATTEMPTS):
        data = envelope_data(http_json(funding_url(f"/request/{request_id}")))
        if not isinstance(data, dict):
            raise SmokeFailure(f"request status has unexpected shape: {data!r}")
        last = data
        status = str(data.get("status", ""))
        if status == "confirmed":
            print("[ok] public Scan request status reached confirmed")
            return data
        if status in {"failed", "rejected"}:
            raise SmokeFailure(f"funding ended in {status}: {data}")
        time.sleep(POLL_SECONDS)
    raise SmokeFailure(
        f"funding did not confirm after {POLL_ATTEMPTS} polls; last status={last}"
    )


def verify_admin_funding(request_id: str, signature: str) -> None:
    payload = http_json(
        admin_url("/api/admin/funding/history?limit=100"),
        opener=ADMIN_OPENER,
    )
    funding_history = envelope_data(payload)
    if not isinstance(funding_history, list):
        raise SmokeFailure(f"Admin funding history has unexpected shape: {funding_history!r}")
    matches = [
        grant
        for funding in funding_history
        if funding.get("requestId") == request_id
        and funding.get("signature") == signature
        and funding.get("confirmed") is True
    ]
    if len(matches) != 1:
        raise SmokeFailure(
            f"expected exactly one confirmed funding transfer for request {request_id}, found {len(matches)}"
        )
    print("[ok] Admin funding history contains exactly one confirmed transfer linked to the request")


def verify_not_in_airdrop_ledger(signature: str) -> None:
    payload = http_json(
        admin_url("/api/admin/funding/airdrops?limit=100"),
        opener=ADMIN_OPENER,
    )
    airdrops = envelope_data(payload)
    if not isinstance(airdrops, list):
        raise SmokeFailure(f"Admin airdrop ledger has unexpected shape: {airdrops!r}")
    if any(item.get("signature") == signature for item in airdrops):
        raise SmokeFailure("confirmed Admin funding was incorrectly recorded as a developer airdrop")
    print("[ok] confirmed funding is absent from the developer airdrop ledger")


def main() -> int:
    try:
        required("AEKO_SCAN_URL")
        required("AEKO_OPERATIONS_URL")
        required("AEKO_RPC_URL")
        required("AEKO_FUNDING_SMOKE_ADDRESS")
        required("ADMIN_PASSWORD")
        if NETWORK not in {"testnet", "devnet", "localnet"}:
            raise SmokeFailure(
                "AEKO_NETWORK must be testnet, devnet, or localnet; mainnet funding is intentionally unsupported"
            )

        health = rpc("getHealth")
        if health != "ok":
            raise SmokeFailure(f"RPC health expected 'ok', got {health!r}")
        print(f"[ok] {NETWORK} RPC is healthy")

        policy = envelope_data(http_json(funding_url("/policy")))
        if not isinstance(policy, dict) or policy.get("enabled") is not True:
            raise SmokeFailure(f"public funding policy is not enabled: {policy!r}")
        amount = Decimal(str(policy.get("amountAeko")))
        expected_lamports = int(
            (amount * LAMPORTS_PER_AEKO).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )

        before = balance(ADDRESS)
        print(f"[info] starting balance={before} lamports; request={amount} AEKO")

        created = envelope_data(
            http_json(
                funding_url("/request"),
                payload={"address": ADDRESS},
                expected_status=202,
            )
        )
        if not isinstance(created, dict) or created.get("status") != "pending":
            raise SmokeFailure(f"public request was not created pending: {created!r}")
        request_id = str(created.get("id", "")).strip()
        if not request_id:
            raise SmokeFailure("public request did not return an id")
        print(f"[ok] Scan created pending request {request_id}")

        ensure_scan_cannot_decide_funding(request_id)
        login_admin()
        approve_from_admin(request_id)
        confirmed = wait_for_terminal(request_id)

        signature = str(confirmed.get("signature", "")).strip()
        if not signature:
            raise SmokeFailure("confirmed request has no transaction signature")

        after = balance(ADDRESS)
        delta = after - before
        if delta < expected_lamports:
            raise SmokeFailure(
                f"wallet balance increased by {delta}, expected at least {expected_lamports} lamports"
            )
        print(f"[ok] wallet balance increased by {delta} lamports")

        verify_admin_funding(request_id, signature)
        verify_not_in_airdrop_ledger(signature)
    except SmokeFailure as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1

    print(
        "[PASS] Scan request -> Admin approval -> protected settlement -> "
        "chain confirmation -> funding history is end-to-end coherent"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
