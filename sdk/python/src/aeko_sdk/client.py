from __future__ import annotations

import json
from base64 import b64encode
from itertools import count
from typing import Any
from urllib import request

from .errors import AekoRpcError
from .types import RpcResponse, SignatureStatusResponse


class AekoClient:
    def __init__(self, rpc_url: str, *, timeout: float = 30.0) -> None:
        self.rpc_url = rpc_url
        self.timeout = timeout
        self._id_counter = count(1)

    def rpc(self, method: str, params: list[Any] | None = None) -> Any:
        body = {
            "jsonrpc": "2.0",
            "id": next(self._id_counter),
            "method": method,
            "params": params or [],
        }
        raw_body = json.dumps(body).encode("utf-8")
        http_request = request.Request(
            self.rpc_url,
            data=raw_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(http_request, timeout=self.timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))

        if "error" in payload:
            error = payload["error"]
            raise AekoRpcError(
                error.get("message", "AEKO RPC request failed"),
                code=error.get("code"),
                data=error.get("data"),
            )

        parsed = RpcResponse(
            jsonrpc=payload.get("jsonrpc", "2.0"),
            id=payload.get("id", 0),
            result=payload.get("result"),
        )
        return parsed.result

    def get_latest_blockhash(self) -> str:
        result = self.rpc("getLatestBlockhash")
        return result["value"]["blockhash"]

    def get_balance(self, pubkey: str) -> int:
        result = self.rpc("getBalance", [pubkey])
        return int(result["value"])

    def get_account_info(
        self,
        pubkey: str,
        *,
        encoding: str = "base64",
    ) -> dict[str, Any] | None:
        result = self.rpc("getAccountInfo", [pubkey, {"encoding": encoding}])
        return result["value"]

    def get_program_accounts(
        self,
        program_id: str,
        *,
        encoding: str = "base64",
        filters: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        config: dict[str, Any] = {"encoding": encoding}
        if filters:
            config["filters"] = filters
        return self.rpc("getProgramAccounts", [program_id, config])

    def send_transaction(self, transaction_bytes: bytes, *, encoding: str = "base64") -> str:
        encoded = (
            transaction_bytes.decode("utf-8")
            if encoding == "base64" and _looks_like_text(transaction_bytes)
            else b64encode(transaction_bytes).decode("utf-8")
        )
        return self.rpc("sendTransaction", [encoded, {"encoding": encoding}])

    def get_signature_statuses(
        self, signatures: list[str]
    ) -> list[SignatureStatusResponse | None]:
        result = self.rpc("getSignatureStatuses", [signatures])
        statuses = []
        for item in result["value"]:
            if item is None:
                statuses.append(None)
                continue
            statuses.append(
                SignatureStatusResponse(
                    slot=item.get("slot"),
                    confirmations=item.get("confirmations"),
                    confirmation_status=item.get("confirmationStatus"),
                    err=item.get("err"),
                )
            )
        return statuses


def _looks_like_text(value: bytes) -> bool:
    try:
        value.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True
