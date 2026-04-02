from __future__ import annotations

from base64 import b64decode
from dataclasses import dataclass
from typing import Any

from .base58 import b58encode
from .borsh import BorshReader
from .client import AekoClient

TOKEN_721_PROGRAM_ID = b58encode(bytes([10] * 32))
WALLET_PERMISSIONS_PROGRAM_ID = b58encode(bytes([10] * 32))


@dataclass(slots=True)
class MetadataAttribute:
    trait_type: str
    value: str


@dataclass(slots=True)
class Token721Metadata:
    name: str
    description: str | None
    uri: str
    image_uri: str | None
    attributes: list[MetadataAttribute]


@dataclass(slots=True)
class Token721Collection:
    authority: str
    name: str
    symbol: str
    base_uri: str | None
    total_minted: int
    is_initialized: bool


@dataclass(slots=True)
class Token721Token:
    collection: str
    token_id: int
    owner: str
    creator: str
    royalty_bps: int
    metadata: Token721Metadata
    frozen: bool
    is_initialized: bool


@dataclass(slots=True)
class TokenSpendCap:
    mint: str
    max_single_tx: int | None
    max_daily: int | None


@dataclass(slots=True)
class SpendLimitPolicy:
    max_single_tx_aeko: int | None
    max_daily_aeko: int | None
    token_caps: list[TokenSpendCap]


@dataclass(slots=True)
class DelegatePermission:
    delegate: str
    role: str
    label: str | None
    status: str
    valid_from_epoch: int
    valid_until_epoch: int | None
    spend_limit: SpendLimitPolicy
    program_allowlist: list[str]
    token_allowlist: list[str]
    app_scope_hashes: list[str]
    requires_reauth: bool
    last_used_epoch: int | None
    last_used_slot: int | None


@dataclass(slots=True)
class WalletPermissionAccount:
    wallet: str
    did: str
    version: int
    policy_nonce: int
    is_frozen: bool
    freeze_reason_code: int | None
    reauth_required_until_epoch: int | None
    owner: str
    delegates: list[DelegatePermission]
    default_program_policy: str
    created_at_epoch: int
    updated_at_epoch: int
    is_initialized: bool


def _decode_account_bytes(account_info: dict[str, Any]) -> bytes:
    raw_data = account_info["data"]
    encoded = raw_data[0] if isinstance(raw_data, list) else raw_data
    return b64decode(encoded)


def _decode_metadata(reader: BorshReader) -> Token721Metadata:
    return Token721Metadata(
        name=reader.read_string(),
        description=reader.read_option_string(),
        uri=reader.read_string(),
        image_uri=reader.read_option_string(),
        attributes=reader.read_vec(
            lambda: MetadataAttribute(
                trait_type=reader.read_string(),
                value=reader.read_string(),
            )
        ),
    )


def decode_token_721_collection(account_info: dict[str, Any]) -> Token721Collection:
    reader = BorshReader(_decode_account_bytes(account_info))
    return Token721Collection(
        authority=reader.read_pubkey(),
        name=reader.read_string(),
        symbol=reader.read_string(),
        base_uri=reader.read_option_string(),
        total_minted=reader.read_u64(),
        is_initialized=reader.read_bool(),
    )


def decode_token_721_token(account_info: dict[str, Any]) -> Token721Token:
    reader = BorshReader(_decode_account_bytes(account_info))
    return Token721Token(
        collection=reader.read_pubkey(),
        token_id=reader.read_u64(),
        owner=reader.read_pubkey(),
        creator=reader.read_pubkey(),
        royalty_bps=reader.read_u16(),
        metadata=_decode_metadata(reader),
        frozen=reader.read_bool(),
        is_initialized=reader.read_bool(),
    )


def _read_permission_role(value: int) -> str:
    return ["owner", "spender", "viewer"][value]


def _read_permission_status(value: int) -> str:
    return ["active", "revoked", "expired", "frozen"][value]


def _read_program_policy_mode(value: int) -> str:
    return ["deny_by_default", "allow_by_default"][value]


def _decode_spend_limit_policy(reader: BorshReader) -> SpendLimitPolicy:
    return SpendLimitPolicy(
        max_single_tx_aeko=reader.read_option_u64(),
        max_daily_aeko=reader.read_option_u64(),
        token_caps=reader.read_vec(
            lambda: TokenSpendCap(
                mint=reader.read_pubkey(),
                max_single_tx=reader.read_option_u64(),
                max_daily=reader.read_option_u64(),
            )
        ),
    )


def decode_wallet_permission_account(account_info: dict[str, Any]) -> WalletPermissionAccount:
    reader = BorshReader(_decode_account_bytes(account_info))
    wallet = reader.read_pubkey()
    did = reader.read_string()
    version = reader.read_u8()
    policy_nonce = reader.read_u64()
    is_frozen = reader.read_bool()
    freeze_reason_code = reader.read_option_u16()
    reauth_required_until_epoch = reader.read_option_u64()
    owner = reader.read_pubkey()
    delegates = reader.read_vec(
        lambda: DelegatePermission(
            delegate=reader.read_pubkey(),
            role=_read_permission_role(reader.read_u8()),
            label=reader.read_option_string(),
            status=_read_permission_status(reader.read_u8()),
            valid_from_epoch=reader.read_u64(),
            valid_until_epoch=reader.read_option_u64(),
            spend_limit=_decode_spend_limit_policy(reader),
            program_allowlist=reader.read_vec(reader.read_pubkey),
            token_allowlist=reader.read_vec(reader.read_pubkey),
            app_scope_hashes=reader.read_vec(lambda: reader._take(32).hex()),
            requires_reauth=reader.read_bool(),
            last_used_epoch=reader.read_option_u64(),
            last_used_slot=reader.read_option_u64(),
        )
    )
    reader.read_vec(  # usage windows, currently skipped in the public Python view
        lambda: (
            reader.read_pubkey(),
            reader.read_u64(),
            reader.read_u64(),
            reader.read_vec(lambda: (reader.read_pubkey(), reader.read_u64())),
        )
    )
    default_program_policy = _read_program_policy_mode(reader.read_u8())
    created_at_epoch = reader.read_u64()
    updated_at_epoch = reader.read_u64()
    is_initialized = reader.read_bool()
    return WalletPermissionAccount(
        wallet=wallet,
        did=did,
        version=version,
        policy_nonce=policy_nonce,
        is_frozen=is_frozen,
        freeze_reason_code=freeze_reason_code,
        reauth_required_until_epoch=reauth_required_until_epoch,
        owner=owner,
        delegates=delegates,
        default_program_policy=default_program_policy,
        created_at_epoch=created_at_epoch,
        updated_at_epoch=updated_at_epoch,
        is_initialized=is_initialized,
    )


def get_token_721_collection(client: AekoClient, account: str) -> Token721Collection:
    info = client.get_account_info(account)
    if info is None:
        raise ValueError(f"Collection account {account} was not found.")
    if info["owner"] != TOKEN_721_PROGRAM_ID:
        raise ValueError(f"Collection account {account} is not owned by the AEKO-721 program.")
    return decode_token_721_collection(info)


def get_token_721_token(client: AekoClient, account: str) -> Token721Token:
    info = client.get_account_info(account)
    if info is None:
        raise ValueError(f"Token account {account} was not found.")
    if info["owner"] != TOKEN_721_PROGRAM_ID:
        raise ValueError(f"Token account {account} is not owned by the AEKO-721 program.")
    return decode_token_721_token(info)


def get_wallet_permission_account(client: AekoClient, account: str) -> WalletPermissionAccount:
    info = client.get_account_info(account)
    if info is None:
        raise ValueError(f"Wallet permission account {account} was not found.")
    if info["owner"] != WALLET_PERMISSIONS_PROGRAM_ID:
        raise ValueError(
            f"Wallet permission account {account} is not owned by the wallet-permissions program."
        )
    return decode_wallet_permission_account(info)
