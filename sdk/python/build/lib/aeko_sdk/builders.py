from __future__ import annotations

from base64 import b64encode
from dataclasses import dataclass

from .accounts import TOKEN_721_PROGRAM_ID, WALLET_PERMISSIONS_PROGRAM_ID
from .base58 import b58decode


def _encode_u8(value: int) -> bytes:
    return value.to_bytes(1, "little")


def _encode_u16(value: int) -> bytes:
    return value.to_bytes(2, "little")


def _encode_u32(value: int) -> bytes:
    return value.to_bytes(4, "little")


def _encode_u64(value: int) -> bytes:
    return value.to_bytes(8, "little")


def _encode_bool(value: bool) -> bytes:
    return _encode_u8(1 if value else 0)


def _encode_string(value: str) -> bytes:
    encoded = value.encode("utf-8")
    return _encode_u32(len(encoded)) + encoded


def _encode_option_string(value: str | None) -> bytes:
    return b"\x00" if value is None else b"\x01" + _encode_string(value)


def _encode_option_u64(value: int | None) -> bytes:
    return b"\x00" if value is None else b"\x01" + _encode_u64(value)


def _encode_pubkey(value: str) -> bytes:
    return b58decode(value)


def _encode_vec(items: list, encoder) -> bytes:
    return _encode_u32(len(items)) + b"".join(encoder(item) for item in items)


def _encode_metadata(metadata: "Token721MetadataInput") -> bytes:
    return (
        _encode_string(metadata.name)
        + _encode_option_string(metadata.description)
        + _encode_string(metadata.uri)
        + _encode_option_string(metadata.image_uri)
        + _encode_vec(metadata.attributes, lambda item: _encode_string(item.trait_type) + _encode_string(item.value))
    )


@dataclass(slots=True)
class InstructionAccount:
    pubkey: str
    is_signer: bool
    is_writable: bool


@dataclass(slots=True)
class MetadataAttributeInput:
    trait_type: str
    value: str


@dataclass(slots=True)
class Token721MetadataInput:
    name: str
    uri: str
    description: str | None = None
    image_uri: str | None = None
    attributes: list[MetadataAttributeInput] | None = None


def _instruction(program_id: str, accounts: list[InstructionAccount], data: bytes) -> dict:
    return {
        "programId": program_id,
        "accounts": [
            {
                "pubkey": account.pubkey,
                "isSigner": account.is_signer,
                "isWritable": account.is_writable,
            }
            for account in accounts
        ],
        "dataBase64": b64encode(data).decode("utf-8"),
    }


def build_initialize_collection_instruction(
    *,
    collection: str,
    authority: str,
    name: str,
    symbol: str,
    base_uri: str | None = None,
    program_id: str = TOKEN_721_PROGRAM_ID,
) -> dict:
    data = _encode_u8(0) + _encode_string(name) + _encode_string(symbol) + _encode_option_string(base_uri)
    return _instruction(
        program_id,
        [
            InstructionAccount(collection, False, True),
            InstructionAccount(authority, True, True),
        ],
        data,
    )


def build_mint_nft_instruction(
    *,
    collection: str,
    token: str,
    authority: str,
    token_id: int,
    owner: str,
    creator: str,
    royalty_bps: int,
    metadata: Token721MetadataInput,
    program_id: str = TOKEN_721_PROGRAM_ID,
) -> dict:
    attributes = metadata.attributes or []
    metadata_bytes = _encode_metadata(
        Token721MetadataInput(
            name=metadata.name,
            description=metadata.description,
            uri=metadata.uri,
            image_uri=metadata.image_uri,
            attributes=attributes,
        )
    )
    data = (
        _encode_u8(1)
        + _encode_u64(token_id)
        + _encode_pubkey(owner)
        + _encode_pubkey(creator)
        + _encode_u16(royalty_bps)
        + metadata_bytes
    )
    return _instruction(
        program_id,
        [
            InstructionAccount(collection, False, True),
            InstructionAccount(token, False, True),
            InstructionAccount(authority, True, False),
        ],
        data,
    )


def build_transfer_nft_instruction(
    *,
    token: str,
    owner: str,
    new_owner: str,
    program_id: str = TOKEN_721_PROGRAM_ID,
) -> dict:
    return _instruction(
        program_id,
        [
            InstructionAccount(token, False, True),
            InstructionAccount(owner, True, False),
        ],
        _encode_u8(4) + _encode_pubkey(new_owner),
    )


def build_update_metadata_instruction(
    *,
    token: str,
    authority: str,
    metadata: Token721MetadataInput,
    program_id: str = TOKEN_721_PROGRAM_ID,
) -> dict:
    return _instruction(
        program_id,
        [
            InstructionAccount(token, False, True),
            InstructionAccount(authority, True, False),
        ],
        _encode_u8(5)
        + _encode_metadata(
            Token721MetadataInput(
                name=metadata.name,
                description=metadata.description,
                uri=metadata.uri,
                image_uri=metadata.image_uri,
                attributes=metadata.attributes or [],
            )
        ),
    )


def build_initialize_wallet_permissions_instruction(
    *,
    permission_state: str,
    audit_log: str,
    owner: str,
    wallet: str,
    did: str,
    current_epoch: int,
    default_program_policy: int,
    program_id: str = WALLET_PERMISSIONS_PROGRAM_ID,
) -> dict:
    data = (
        _encode_u8(0)
        + _encode_pubkey(wallet)
        + _encode_string(did)
        + _encode_u64(current_epoch)
        + _encode_u8(default_program_policy)
    )
    return _instruction(
        program_id,
        [
            InstructionAccount(permission_state, False, True),
            InstructionAccount(audit_log, False, True),
            InstructionAccount(owner, True, False),
        ],
        data,
    )


def build_freeze_wallet_instruction(
    *,
    permission_state: str,
    audit_log: str,
    owner: str,
    reason_code: int | None,
    reauth_required_until_epoch: int | None,
    current_epoch: int,
    current_slot: int,
    program_id: str = WALLET_PERMISSIONS_PROGRAM_ID,
) -> dict:
    reason_bytes = b"\x00" if reason_code is None else b"\x01" + _encode_u16(reason_code)
    data = (
        _encode_u8(4)
        + reason_bytes
        + _encode_option_u64(reauth_required_until_epoch)
        + _encode_u64(current_epoch)
        + _encode_u64(current_slot)
    )
    return _instruction(
        program_id,
        [
            InstructionAccount(permission_state, False, True),
            InstructionAccount(audit_log, False, True),
            InstructionAccount(owner, True, False),
        ],
        data,
    )
