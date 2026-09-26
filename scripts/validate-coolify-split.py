#!/usr/bin/env python3
"""Static invariants for independently deployable Coolify resources."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COOLIFY = ROOT / "docker" / "coolify"

RESOURCES = {
    "bootstrap": ["key-bootstrap", "social-bootstrap", "protocol-bootstrap", "bootstrap-registry"],
    "faucet-tools": ["faucet", "wallet-tools"],
    "validator": ["validator"],
    "explorer-api": ["explorer-api"],
    "explorer-ui": ["explorer-ui"],
    "operations-web": ["operations-web"],
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


def service_block(compose: str, service: str) -> str:
    match = re.search(rf"^  {re.escape(service)}:\s*$", compose, re.MULTILINE)
    require(match is not None, f"missing service block: {service}")
    tail = compose[match.end() :]
    next_service = re.search(r"^  [A-Za-z0-9_.-]+:\s*$", tail, re.MULTILINE)
    return tail[: next_service.start()] if next_service else tail


def interpolated_names(compose: str) -> set[str]:
    return set(re.findall(r"\$\{([A-Z][A-Z0-9_]*)", compose))


def documented_names(env_example: str) -> set[str]:
    return set(re.findall(r"^([A-Z][A-Z0-9_]*)=", env_example, re.MULTILINE))


def require_literal_bind_sources(label: str, compose: str) -> None:
    for source in re.findall(r"^\s+source:\s*(.+?)\s*$", compose, re.MULTILINE):
        require("${" not in source, f"{label} bind source must be literal for Coolify: {source}")
        require(source.startswith("/data/aeko/"), f"{label} persistent bind must stay under /data/aeko: {source}")


def validate_common(label: str, expected_services: list[str], compose: str, env_example: str) -> None:
    names = service_names(compose)
    require(
        names == expected_services,
        f"{label} services changed; expected {expected_services}, found {names}",
    )
    require("build:" not in compose, f"{label} must pull published images, not build source")
    require(
        compose.count("pull_policy: always") == len(expected_services),
        f"{label} must always pull the selected image tag for every service",
    )
    require("type: volume" not in compose, f"{label} must not use project-scoped named volumes")
    require("x-logging: &default-logging" in compose, f"{label} must use bounded json-file logging")
    require_literal_bind_sources(label, compose)

    undocumented = interpolated_names(compose) - documented_names(env_example)
    require(not undocumented, f"{label} .env.example is missing Compose variables: {sorted(undocumented)}")

    for forbidden in ("http://validator:8899", "http://explorer-api:8088"):
        require(forbidden not in compose, f"{label} still depends on monolithic Docker DNS: {forbidden}")

    for retired in (
        "AEKO_INTERNAL_RPC_URL",
        "AEKO_PUBLIC_RPC_URL",
        "AEKO_PUBLIC_WS_URL",
        "AEKO_INTERNAL_EXPLORER_API_URL",
        "AEKO_INTERNAL_MAINNET_EXPLORER_API_URL",
        "AEKO_INTERNAL_LOCALNET_EXPLORER_API_URL",
        "AEKO_INTERNAL_FAUCET_ADDRESS",
        "AEKO_PUBLIC_IP",
    ):
        require(retired not in compose, f"{label} split contract still exposes retired endpoint name {retired}")


def main() -> int:
    read(COOLIFY / "README.md")

    loaded: dict[str, str] = {}
    for label, expected_services in RESOURCES.items():
        directory = COOLIFY / label
        compose = read(directory / "compose.yml")
        env_example = read(directory / ".env.example")
        validate_common(label, expected_services, compose, env_example)
        loaded[label] = compose

    for label in ("bootstrap", "faucet-tools", "validator"):
        require(
            "${AEKO_IMAGE_TAG:?" in loaded[label],
            f"{label} must require an explicit immutable image tag",
        )
        require(
            "${AEKO_IMAGE_TAG:-latest}" not in loaded[label],
            f"{label} must not silently roll forward through latest",
        )

    for label in ("explorer-api", "explorer-ui", "operations-web"):
        require(
            "${AEKO_IMAGE_TAG:-latest}" in loaded[label],
            f"{label} must support post-promotion latest-tag application deploys",
        )

    bootstrap = loaded["bootstrap"]
    key_bootstrap = service_block(bootstrap, "key-bootstrap")
    social = service_block(bootstrap, "social-bootstrap")
    protocol = service_block(bootstrap, "protocol-bootstrap")
    registry = service_block(bootstrap, "bootstrap-registry")

    require("source: /data/aeko/keys" in key_bootstrap, "key bootstrap must own the fixed key path")
    require("source: /data/aeko/protocol-state" in key_bootstrap, "key bootstrap must inspect Protocol state")
    require("source: /data/aeko/protocol-continuity" in key_bootstrap, "key bootstrap must inspect Protocol continuity")
    require(
        "AEKO_ALLOW_CHAIN_KEY_GENERATION: ${AEKO_ALLOW_CHAIN_KEY_GENERATION:-0}" in key_bootstrap,
        "key bootstrap must fail closed unless first-boot generation is explicit",
    )
    require('restart: "no"' in key_bootstrap, "key bootstrap must remain one-shot")

    for label, block in (("Social", social), ("Protocol", protocol)):
        require(
            "AEKO_RPC_URL: ${AEKO_TESTNET_RPC_URL:-https://rpc.aeko.online}" in block,
            f"{label} bootstrap must use the canonical testnet RPC domain",
        )
        require(
            "key-bootstrap:" in block and "condition: service_completed_successfully" in block,
            f"{label} bootstrap must wait for the co-located key preflight",
        )
        require("validator:" not in block, f"{label} bootstrap must not depend on a validator Compose service")
        require('restart: "no"' in block, f"{label} bootstrap must remain one-shot")

    require("source: /data/aeko/social-state" in social, "Social bootstrap state must use a stable host path")
    require("source: /data/aeko/protocol-state" in protocol, "Protocol state must use a stable host path")
    require("source: /data/aeko/protocol-continuity" in protocol, "Protocol continuity must use a stable host path")
    require("source: /data/aeko/social-state" in registry, "registry service must read Social bootstrap state")
    require("source: /data/aeko/protocol-state" in registry, "registry service must read Protocol bootstrap state")
    require("source: /data/aeko/keys" not in registry, "registry service must never mount private key custody")
    require("/www/testnet/social.env" in registry, "registry service must expose only the Social registry document")
    require("/www/testnet/protocol.env" in registry, "registry service must expose only the Protocol registry document")
    require('expose:\n      - "8080"' in registry, "registry service must expose its HTTP port to Coolify routing")

    faucet_tools = loaded["faucet-tools"]
    faucet = service_block(faucet_tools, "faucet")
    wallet_tools = service_block(faucet_tools, "wallet-tools")
    require("depends_on:" not in faucet_tools, "Faucet/tools resource must not invent a runtime dependency")
    require(
        '"${AEKO_TESTNET_FAUCET_PORT:-9900}:9900"' in faucet,
        "Faucet must publish the named testnet TCP service port",
    )
    require("source: /data/aeko/keys" in faucet, "Faucet must read the persistent chain key store")
    require('profiles: ["ops"]' in wallet_tools, "wallet tools must remain opt-in operator tooling")
    require("source: /data/aeko/keys" in wallet_tools, "wallet tools must use the persistent chain key store")

    validator = loaded["validator"]
    require("depends_on:" not in validator, "validator must remain independent of other Compose resources")
    require("source: /data/aeko/validator-ledger" in validator, "validator ledger must use stable host storage")
    require("source: /data/aeko/keys" in validator, "validator must mount persistent chain identities")
    require(
        "AEKO_REQUIRE_EXISTING_LEDGER: ${AEKO_REQUIRE_EXISTING_LEDGER:-1}" in validator,
        "split validator must fail closed on an established-chain missing ledger",
    )
    require(
        "AEKO_FAUCET_ADDRESS: ${AEKO_TESTNET_FAUCET_ADDRESS:-faucet.aeko.online:9900}" in validator,
        "split validator must use the canonical testnet Faucet DNS endpoint",
    )
    require(
        "AEKO_GOSSIP_HOST: ${AEKO_TESTNET_GOSSIP_HOST:-gossip.aeko.online}" in validator,
        "split validator must advertise the canonical testnet gossip hostname",
    )
    require("df -Pk /ledger" in validator, "split validator healthcheck must enforce the low-disk guard")
    require('expose:\n      - "8899"\n      - "8900"' in validator, "Validator RPC/WS must be routable through Coolify domains")
    require("AEKO_RPC_BIND_IP" not in validator and "AEKO_WS_BIND_IP" not in validator, "Validator split contract must not require host IP bindings for RPC/WS")

    explorer_api = loaded["explorer-api"]
    require("depends_on:" not in explorer_api, "Explorer API must remain independent of validator Compose lifecycle")
    require(
        "AEKO_EXPLORER_RPC: ${AEKO_TESTNET_RPC_URL:-https://rpc.aeko.online}" in explorer_api,
        "Explorer API must use the canonical testnet RPC domain",
    )
    require(
        "AEKO_EXPLORER_WS: ${AEKO_TESTNET_WS_URL:-wss://ws.aeko.online}" in explorer_api,
        "Explorer API must use the canonical testnet WebSocket domain",
    )
    require("DATABASE_URL: ${EXPLORER_DATABASE_URL:?" in explorer_api, "Explorer API must require persistent PostgreSQL")
    require("volumes:" not in explorer_api, "Explorer API split resource must not require bootstrap-host filesystem mounts")
    require("ports:" not in explorer_api, "Explorer API split resource must rely on Coolify domain routing, not host-port binding")
    require(
        "AEKO_SOCIAL_REGISTRY_URL: ${AEKO_TESTNET_SOCIAL_REGISTRY_URL:-https://registry.aeko.online/testnet/social.env}" in explorer_api,
        "Explorer API must consume the Social registry over the canonical registry domain",
    )
    require(
        "AEKO_PROTOCOL_REGISTRY_URL: ${AEKO_TESTNET_PROTOCOL_REGISTRY_URL:-https://registry.aeko.online/testnet/protocol.env}" in explorer_api,
        "Explorer API must consume the Protocol registry over the canonical registry domain",
    )
    require("AEKO_SOCIAL_REGISTRY_FILE" not in explorer_api and "AEKO_PROTOCOL_REGISTRY_FILE" not in explorer_api, "split Explorer API must not depend on local bootstrap registry files")

    explorer_ui = loaded["explorer-ui"]
    require("depends_on:" not in explorer_ui, "Explorer UI must remain independently deployable")
    require(
        "AEKO_TESTNET_EXPLORER_API_URL: ${AEKO_TESTNET_EXPLORER_API_URL:-https://api.aeko.online}" in explorer_ui,
        "Explorer UI must use the canonical testnet Explorer API domain",
    )

    operations = loaded["operations-web"]
    require("depends_on:" not in operations, "Operations Web must remain independently deployable")
    require(
        "AEKO_TESTNET_RPC_URL: ${AEKO_TESTNET_RPC_URL:-https://rpc.aeko.online}" in operations,
        "Operations Web must use the canonical testnet RPC domain",
    )
    require(
        "AEKO_TESTNET_EXPLORER_API_URL: ${AEKO_TESTNET_EXPLORER_API_URL:-https://api.aeko.online}" in operations,
        "Operations Web must use the canonical testnet Explorer API domain",
    )

    print("split Coolify deployment contract: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
