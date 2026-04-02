from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class RpcResponse:
    jsonrpc: str
    id: int
    result: Any


@dataclass(slots=True)
class SignatureStatusResponse:
    slot: int | None
    confirmations: int | None
    confirmation_status: str | None
    err: Any
