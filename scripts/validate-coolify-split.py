#!/usr/bin/env python3
"""Static invariants for independently deployable Coolify resources."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COOLIFY = ROOT / "docker" / "coolify"

RESOURCES = {
    "key-bootstrap": "key-bootstrap",
    "faucet": "faucet",
    "validator": "validator",
    "social-bootstrap": "social-bootstrap",
    "protocol-bootstrap": "protocol-bootstrap",
    "explorer-api": "explorer-api",
    "explorer-ui": "explorer-ui",
    "operations-web": "operations-web",
    "wallet-tools": "wallet-tools",
}


class ContractFailure(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractFailure(message)


def read(path: Path) -> str:
    require(path.is_file(), f"missing required split Coolify file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def service_names(compose: str) -> list[str]:
    marker = re.search(r"^services:\s*$", compose, re.MULTILINE)
    require(marker is not None, "Compose file has no services block")
    tail = compose[marker.end() :]
    return re.findall(r"^  ([A-Za-z0-9_.-]+):\s*$", tail, re.MULTILINE)


def interpolated_names(compose: str) -> set[str]:
    return set(re.findall(r"\$\{([A-Z][A-Z0-9_]*)", compose))


def documented_names(env_example: str) -> set[str]:
    return set(re.findall(r"^([A-Z][A-Z0-9_]*)=", env_example, re.MULTILINE))


def require_literal_bind_sources(label: str, compose: str) -> None:
    for source in re.findall(r"^\s+source:\s*(.+?)\s*$", compose, re.MULTILINE):
        require("${" not in source, f"{label} bind source must be literal for Coolify: {source}")
        require(source.startswith("/data/aeko/"), f"{label} persistent bind must stay under /data/aeko: {source}")


def validate_common(label: str, service: str, compose: str, env_example: str) -> None:
    names = service_names(compose)
    require(names == [service], f"{label} must contain exactly one deployable service ({service}); found {names}")
    require("build:" not in compose, f"{label} must pull a published image, not build source")
    require("pull_policy: always" in compose, f"{label} must always pull the selected image tag")
    require("depends_on:" not in compose, f"{label} must not contain cross-resource Compose dependencies")
    require("type: volume" not in compose, f"{label} must not use project-scoped named volumes")
    require("x-logging: &default-logging" in compose, f"{label} must use bounded json-file logging")
    require_literal_bind_sources(label, compose)

    undocumented = interpolated_names(compose) - documented_names(env_example)
    require(not undocumented, f"{label} .env.example is missing Compose variables: {sorted(undocumented)}")

    for forbidden in ("http://validator:8899", "faucet:9900", "http://explorer-api:8088"):
        require(forbidden not in compose, f"{label} still depends on monolithic Docker DNS: {forbidden}")


def main() -> int:
    read(COOLIFY / "README.md")

    loaded: dict[str, str] = {}
    for label, service in RESOURCES.items():
        directory = COOLIFY / label
        compose = read(directory / "compose.yml")
        env_example = read(directory / ".env.example")
        validate_common(label, service, compose, env_example)
        loaded[label] = compose

    key_bootstrap = loaded["key-bootstrap"]
    require("source: /data/aeko/keys" in key_bootstrap, "key bootstrap must own the fixed key path")
    require("source: /data/aeko/protocol-state" in key_bootstrap, "key bootstrap must inspect Protocol state")
    require("source: /data/aeko/protocol-continuity" in key_bootstrap, "key bootstrap must inspect Protocol continuity")
    require(
        "AEKO_ALLOW_CHAIN_KEY_GENERATION: ${AEKO_ALLOW_CHAIN_KEY_GENERATION:-0}" in key_bootstrap,
        "key bootstrap must fail closed unless first-boot generation is explicit",
    )

    validator = loaded["validator"]
    require("source: /data/aeko/validator-ledger" in validator, "validator ledger must use stable host storage")
    require("source: /data/aeko/keys" in validator, "validator must mount persistent chain identities")
    require(
        "AEKO_REQUIRE_EXISTING_LEDGER: ${AEKO_REQUIRE_EXISTING_LEDGER:-1}" in validator,
        "split validator must fail closed on an established-chain missing ledger",
    )
    require(
        "AEKO_FAUCET_ADDRESS: ${AEKO_INTERNAL_FAUCET_ADDRESS:?" in validator,
        "split validator must require an explicit private Faucet endpoint",
    )
    require("df -Pk /ledger" in validator, "split validator healthcheck must enforce the low-disk guard")

    social = loaded["social-bootstrap"]
    require("AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:?" in social, "Social bootstrap must require explicit validator RPC")
    require("source: /data/aeko/social-state" in social, "Social bootstrap state must use a stable host path")
    require('restart: "no"' in social, "Social bootstrap must remain a one-shot job")

    protocol = loaded["protocol-bootstrap"]
    require("AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:?" in protocol, "Protocol bootstrap must require explicit validator RPC")
    require("source: /data/aeko/protocol-state" in protocol, "Protocol state must use a stable host path")
    require("source: /data/aeko/protocol-continuity" in protocol, "Protocol continuity must use a stable host path")
    require('restart: "no"' in protocol, "Protocol bootstrap must remain a one-shot job")

    explorer_api = loaded["explorer-api"]
    require("AEKO_EXPLORER_RPC: ${AEKO_INTERNAL_RPC_URL:?" in explorer_api, "Explorer API must require explicit validator RPC")
    require("DATABASE_URL: ${EXPLORER_DATABASE_URL:?" in explorer_api, "Explorer API must require persistent PostgreSQL")
    require("source: /data/aeko/social-state" in explorer_api, "Explorer API must read canonical Social registry state")
    require("source: /data/aeko/protocol-state" in explorer_api, "Explorer API must read canonical Protocol registry state")
    for registry_key in (
        "AEKO_REGISTRY_SCHEMA_VERSION",
        "AEKO_CHAIN_GENESIS_HASH",
        "AEKO_SOCIAL_POSTS_STATE",
        "AEKO_SOCIAL_REWARDS_STATE",
        "AEKO_SOCIAL_STAKING_STATE",
        "AEKO_SOCIAL_ANTI_SPAM_STATE",
        "AEKO_SOCIAL_MONETIZATION_STATE",
        "AEKO_PROTOCOL_AUTHORITY",
        "AEKO_TOKENOMICS_PROGRAM_ID",
        "AEKO_FINALITY_ORACLE_PROGRAM_ID",
        "AEKO_TOKENOMICS_STATE",
        "AEKO_FINALITY_ORACLE_STATE",
    ):
        require(
            f"{registry_key}: ${{{registry_key}:-}}" in explorer_api,
            f"Explorer API must expose cross-host registry override {registry_key}",
        )

    explorer_ui = loaded["explorer-ui"]
    require(
        "AEKO_INTERNAL_EXPLORER_API_URL: ${AEKO_INTERNAL_EXPLORER_API_URL:?" in explorer_ui,
        "Explorer UI must require an explicit private Explorer API upstream",
    )

    operations = loaded["operations-web"]
    require("AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:?" in operations, "Operations Web must require explicit validator RPC")
    require(
        "AEKO_INTERNAL_EXPLORER_API_URL: ${AEKO_INTERNAL_EXPLORER_API_URL:?" in operations,
        "Operations Web must require an explicit private Explorer API upstream",
    )

    print("split Coolify deployment contract: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
