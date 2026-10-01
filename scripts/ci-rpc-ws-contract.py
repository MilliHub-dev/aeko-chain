#!/usr/bin/env python3
"""Runtime WebSocket contract probe for the AEKO Validator.

Discovers every subscription declared by the checked-out RPC source, verifies
that the running Validator registers it, and requires a live slot notification.
Only Python's standard library is used.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import socket
import struct
import time
from pathlib import Path
from typing import Any

SYSTEM_PROGRAM = "11111111111111111111111111111111"
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class ProbeError(RuntimeError):
    pass


class WebSocket:
    def __init__(self, host: str, port: int, timeout: float = 10.0) -> None:
        self.host = host
        self.port = port
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(timeout)
        self._handshake()

    def _read_exact(self, size: int) -> bytes:
        chunks: list[bytes] = []
        remaining = size
        while remaining:
            chunk = self.sock.recv(remaining)
            if not chunk:
                raise ProbeError("WebSocket peer closed the connection")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def _handshake(self) -> None:
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            "GET / HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        ).encode("ascii")
        self.sock.sendall(request)

        response = bytearray()
        while b"\r\n\r\n" not in response:
            response.extend(self._read_exact(1))
            if len(response) > 32 * 1024:
                raise ProbeError("WebSocket handshake response is too large")

        header = response.decode("latin1")
        first_line = header.split("\r\n", 1)[0]
        if " 101 " not in first_line:
            raise ProbeError(f"WebSocket upgrade failed: {first_line}")

        headers: dict[str, str] = {}
        for line in header.split("\r\n")[1:]:
            if ":" in line:
                name, value = line.split(":", 1)
                headers[name.strip().lower()] = value.strip()

        expected = base64.b64encode(
            hashlib.sha1((key + WS_GUID).encode("ascii")).digest()
        ).decode("ascii")
        if headers.get("sec-websocket-accept") != expected:
            raise ProbeError("WebSocket Sec-WebSocket-Accept mismatch")

    def send_json(self, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        mask = os.urandom(4)
        length = len(raw)
        frame = bytearray([0x81])
        if length < 126:
            frame.append(0x80 | length)
        elif length <= 0xFFFF:
            frame.append(0x80 | 126)
            frame.extend(struct.pack("!H", length))
        else:
            frame.append(0x80 | 127)
            frame.extend(struct.pack("!Q", length))
        frame.extend(mask)
        frame.extend(bytes(byte ^ mask[index % 4] for index, byte in enumerate(raw)))
        self.sock.sendall(frame)

    def recv_json(self, timeout: float | None = None) -> dict[str, Any]:
        if timeout is not None:
            self.sock.settimeout(timeout)
        while True:
            first, second = self._read_exact(2)
            opcode = first & 0x0F
            length = second & 0x7F
            masked = bool(second & 0x80)
            if length == 126:
                length = struct.unpack("!H", self._read_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._read_exact(8))[0]
            mask = self._read_exact(4) if masked else None
            payload = self._read_exact(length)
            if mask:
                payload = bytes(
                    byte ^ mask[index % 4] for index, byte in enumerate(payload)
                )

            if opcode == 0x8:
                raise ProbeError("WebSocket server closed the connection")
            if opcode == 0x9:
                self._send_control(0xA, payload)
                continue
            if opcode != 0x1:
                continue
            try:
                value = json.loads(payload.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise ProbeError("WebSocket returned invalid JSON") from exc
            if not isinstance(value, dict):
                raise ProbeError(f"WebSocket JSON response is not an object: {value!r}")
            return value

    def _send_control(self, opcode: int, payload: bytes) -> None:
        if len(payload) > 125:
            raise ProbeError("invalid WebSocket control frame")
        mask = os.urandom(4)
        frame = bytearray([0x80 | opcode, 0x80 | len(payload)])
        frame.extend(mask)
        frame.extend(bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload)))
        self.sock.sendall(frame)

    def close(self) -> None:
        try:
            self._send_control(0x8, b"")
        except OSError:
            pass
        finally:
            self.sock.close()


def discover_methods(source: Path) -> list[str]:
    text = source.read_text(encoding="utf-8")
    methods = sorted(
        set(
            re.findall(
                r'#\[\s*pubsub\([^\]]*?name\s*=\s*"([^"]+Subscribe)"[^\]]*\)\s*\]',
                text,
                flags=re.DOTALL,
            )
        )
    )
    if not methods:
        raise ProbeError(f"no pubsub subscription methods discovered in {source}")
    return methods


def params_for(method: str, account: str, signature: str) -> list[Any]:
    params: dict[str, list[Any]] = {
        "accountSubscribe": [
            account,
            {"commitment": "confirmed", "encoding": "base64"},
        ],
        "blockSubscribe": [
            "all",
            {
                "commitment": "confirmed",
                "encoding": "json",
                "transactionDetails": "signatures",
                "showRewards": False,
            },
        ],
        "logsSubscribe": ["all", {"commitment": "confirmed"}],
        "programSubscribe": [
            SYSTEM_PROGRAM,
            {"commitment": "confirmed", "encoding": "base64"},
        ],
        "rootSubscribe": [],
        "signatureSubscribe": [signature, {"commitment": "confirmed"}],
        "slotSubscribe": [],
        "slotsUpdatesSubscribe": [],
        "voteSubscribe": [],
    }
    return params.get(method, [])


def subscribe_once(
    host: str,
    port: int,
    method: str,
    params: list[Any],
    *,
    require_success: bool,
) -> None:
    ws = WebSocket(host, port)
    try:
        request_id = 100
        ws.send_json(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params,
            }
        )
        deadline = time.monotonic() + 10.0
        while time.monotonic() < deadline:
            response = ws.recv_json(max(0.1, deadline - time.monotonic()))
            if response.get("id") != request_id:
                continue
            error = response.get("error")
            if isinstance(error, dict):
                if error.get("code") == -32601:
                    raise ProbeError(f"{method} is not registered: {error}")
                if require_success:
                    raise ProbeError(f"{method} rejected its production probe: {error}")
                print(f"[ok] {method} registered; probe returned {error.get('code')}")
                return
            if "result" not in response:
                raise ProbeError(f"{method} returned neither result nor error: {response}")
            print(f"[ok] {method} registered; subscription={response['result']}")
            return
        raise ProbeError(f"{method} did not answer subscription request")
    finally:
        ws.close()


def require_slot_notification(host: str, port: int) -> None:
    ws = WebSocket(host, port)
    try:
        ws.send_json(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "slotSubscribe",
                "params": [],
            }
        )
        subscription = None
        deadline = time.monotonic() + 25.0
        while time.monotonic() < deadline:
            message = ws.recv_json(max(0.1, deadline - time.monotonic()))
            if message.get("id") == 1:
                if message.get("error"):
                    raise ProbeError(f"slotSubscribe failed: {message['error']}")
                subscription = message.get("result")
                continue
            if message.get("method") == "slotNotification":
                params = message.get("params")
                if not isinstance(params, dict):
                    raise ProbeError(f"invalid slotNotification payload: {message}")
                if subscription is not None and params.get("subscription") != subscription:
                    continue
                print("[ok] slotSubscribe produced a live slotNotification")
                return
        raise ProbeError("slotSubscribe produced no live notification")
    finally:
        ws.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=8900)
    parser.add_argument("--account", required=True)
    parser.add_argument("--signature", required=True)
    parser.add_argument("--source", default="rpc/src/rpc_pubsub.rs")
    parser.add_argument("--manifest")
    args = parser.parse_args()

    methods = discover_methods(Path(args.source))
    if args.manifest:
        Path(args.manifest).write_text("\n".join(methods) + "\n", encoding="utf-8")

    strict = {
        "accountSubscribe",
        "logsSubscribe",
        "programSubscribe",
        "rootSubscribe",
        "signatureSubscribe",
        "slotSubscribe",
    }
    for method in methods:
        subscribe_once(
            args.host,
            args.port,
            method,
            params_for(method, args.account, args.signature),
            require_success=method in strict,
        )

    require_slot_notification(args.host, args.port)
    print(
        f"[PASS] {len(methods)} WebSocket subscription methods are registered "
        "and live PubSub works"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
