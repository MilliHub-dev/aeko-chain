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

    def request_airdrop(
        self,
        pubkey: str,
        lamports: int,
        *,
        recent_blockhash: str | None = None,
    ) -> str:
        """Instant developer airdrop: no admin approval, dispatched immediately."""
        config: dict[str, Any] = {}
        if recent_blockhash:
            config["recentBlockhash"] = recent_blockhash
        return self.rpc("requestAirdrop", [pubkey, lamports, config])

    def request_funding_transfer(
        self,
        pubkey: str,
        lamports: int,
        *,
        funding_authorization: str | None = None,
        recent_blockhash: str | None = None,
    ) -> str:
        """Protected Funding transfer via direct RPC.

        Requires the server-only funding authorization credential when the
        validator configures one. Public clients should use
        ``request_funding`` (Explorer approval queue) instead.
        """
        config: dict[str, Any] = {"fundingAuthorization": funding_authorization}
        if recent_blockhash:
            config["recentBlockhash"] = recent_blockhash
        return self.rpc("requestFunding", [pubkey, lamports, config])

    def request_grant(
        self,
        pubkey: str,
        lamports: int,
        *,
        funding_authorization: str | None = None,
        recent_blockhash: str | None = None,
    ) -> str:
        """Deprecated compatibility alias for :meth:`request_funding_transfer`."""
        return self.request_funding_transfer(
            pubkey,
            lamports,
            funding_authorization=funding_authorization,
            recent_blockhash=recent_blockhash,
        )

    def request_funding(
        self,
        pubkey: str,
        *,
        explorer_api_url: str,
        timeout_secs: float = 300.0,
        poll_interval_secs: float = 4.0,
        no_wait: bool = False,
    ) -> dict[str, Any]:
        """Public funding request via the Explorer approval queue.

        Submits ``POST {explorer}/funding/request`` then polls
        ``GET {explorer}/funding/request/:id`` until confirmed, failed,
        rejected, or timeout. Returns ``{"request_id": ..., "signature": ...}``.
        """
        import time
        import urllib.error

        base = explorer_api_url.rstrip("/")

        def _post(path: str, payload: dict[str, Any], headers: dict[str, str] | None = None):
            body = json.dumps(payload).encode("utf-8")
            req = request.Request(
                base + path,
                data=body,
                headers={"Content-Type": "application/json", **(headers or {})},
                method="POST",
            )
            try:
                with request.urlopen(req, timeout=self.timeout) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", "replace")
                try:
                    parsed = json.loads(detail)
                except ValueError:
                    parsed = None
                raise AekoRpcError(
                    f"Funding request failed (HTTP {exc.code}): {detail}",
                    code=exc.code,
                    data=parsed,
                ) from exc

        try:
            created = _post("/funding/request", {"address": pubkey})
        except AekoRpcError as exc:
            # The wallet already has an in-flight request: adopt it and poll
            # it instead of dead-ending on REQUEST_PENDING.
            request_id = _pending_request_id(exc)
            if request_id is None:
                raise
            if no_wait:
                return {"request_id": request_id, "signature": ""}
            return _poll_funding_request(
                self, base, request_id, timeout_secs, poll_interval_secs
            )
        request_id = (created.get("data") or {}).get("id")
        if not request_id:
            raise AekoRpcError("Funding request succeeded but returned no request id")
        if no_wait:
            return {"request_id": request_id, "signature": ""}

        return _poll_funding_request(
            self, base, request_id, timeout_secs, poll_interval_secs
        )

    def send_funding(
        self, pubkey: str, amount_aeko: float, *, explorer_api_url: str, admin_token: str
    ) -> Any:
        """Direct Admin Funding via the Explorer API with no second approval."""
        import urllib.error

        base = explorer_api_url.rstrip("/")
        body = json.dumps({"address": pubkey, "amountAeko": amount_aeko}).encode("utf-8")
        req = request.Request(
            base + "/admin/funding/send",
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-aeko-settings-token": admin_token,
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise AekoRpcError(
                f"Direct funding failed (HTTP {exc.code}): {detail}", code=exc.code
            ) from exc

    def create_grant(
        self, pubkey: str, amount_aeko: float, *, explorer_api_url: str, admin_token: str
    ) -> Any:
        """Deprecated compatibility alias for :meth:`send_funding`."""
        return self.send_funding(
            pubkey,
            amount_aeko,
            explorer_api_url=explorer_api_url,
            admin_token=admin_token,
        )


def _pending_request_id(exc: AekoRpcError) -> str | None:
    """Extracts the in-flight request id from a REQUEST_PENDING rejection."""
    data = exc.data if isinstance(exc.data, dict) else None
    if not data:
        return None
    error = data.get("error") or {}
    if error.get("code") != "REQUEST_PENDING":
        return None
    request_id = error.get("requestId") or error.get("request_id")
    return request_id or None


def _poll_funding_request(
    client: AekoClient,
    base: str,
    request_id: str,
    timeout_secs: float,
    poll_interval_secs: float,
) -> dict[str, Any]:
    import time

    deadline = time.monotonic() + max(timeout_secs, 1.0)
    while True:
        time.sleep(poll_interval_secs)
        status_req = request.Request(f"{base}/funding/request/{request_id}", method="GET")
        with request.urlopen(status_req, timeout=client.timeout) as response:
            status = json.loads(response.read().decode("utf-8"))
        data = status.get("data") or {}
        state = data.get("status", "unknown")
        if state == "confirmed":
            return {"request_id": request_id, "signature": data.get("signature") or ""}
        if state in ("rejected", "failed"):
            raise AekoRpcError(
                f"Funding request {request_id} ended with status {state} "
                f"({data.get('errorCode') or state})"
            )
        if time.monotonic() >= deadline:
            raise AekoRpcError(
                f"Timed out after {timeout_secs}s waiting for admin approval "
                f"of {request_id} (last status: {state})"
            )


def _looks_like_text(value: bytes) -> bool:
    try:
        value.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True
