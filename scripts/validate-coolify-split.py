#!/usr/bin/env python3
"""Static invariants for independently deployable Coolify resources."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COOLIFY = ROOT / "docker" / "coolify"

RESOURCES = {
    "bootstrap": ["key-bootstrap", "social-bootstrap", "protocol-bootstrap", "registry"],
    "faucet-tools": ["faucet", "wallet-tools"],
    "validator": ["validator"],
    "explorer-api": ["explorer-api"],
    "explorer-ui": ["explorer-ui"],
    "operations-web": ["operations-web"],
}

RETIRED_ENDPOINT_NAMES = (
    "AEKO_ENV",
    "AEKO_INTERNAL_RPC_URL",
    "AEKO_INTERNAL_FAUCET_ADDRESS",
    "AEKO_INTERNAL_EXPLORER_API_URL",
    "AEKO_PUBLIC_RPC_URL",
    "AEKO_PUBLIC_WS_URL",
)

NETWORK_PREFIXED_ENDPOINT = re.compile(
    r"AEKO_(?:MAINNET|TESTNET|DEVNET|LOCALNET)_"
    r"(?:RPC_URL|WS_URL|EXPLORER_API_URL|REGISTRY_URL|FAUCET_ADDRESS)"
)


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
        require(
            source.startswith("/data/aeko/"),
            f"{label} persistent bind must stay under /data/aeko: {source}",
        )


def validate_common(label: str, expected_services: list[str], compose: str, env_example: str) -> None:
    names = service_names(compose)
    require(
        names == expected_services,
        f"{label} services changed; expected {expected_services}, found {names}",
    )
    require("build:" not in compose, f"{label} must pull published images, not build source")
    require(
        compose.count("pull_policy: always") == len(expected_services),
        f"{label} must always pull every selected image",
    )
    require("type: volume" not in compose, f"{label} must not use project-scoped named volumes")
    require("x-logging: &default-logging" in compose, f"{label} must use bounded json-file logging")
    require_literal_bind_sources(label, compose)

    undocumented = interpolated_names(compose) - documented_names(env_example)
    require(not undocumented, f"{label} .env.example is missing Compose variables: {sorted(undocumented)}")

    combined = compose + "\n" + env_example
    for retired in RETIRED_ENDPOINT_NAMES:
        require(retired not in combined, f"{label} still uses retired endpoint name {retired}")
    require("10.0.0." not in combined, f"{label} must use DNS/service names instead of sample private IPs")

    if label != "explorer-ui":
        match = NETWORK_PREFIXED_ENDPOINT.search(combined)
        require(
            match is None,
            f"{label} must describe only its active network; found Scan-only endpoint {match.group(0) if match else ''}",
        )


def main() -> int:
    read(COOLIFY / "README.md")

    loaded: dict[str, str] = {}
    envs: dict[str, str] = {}
    for label, expected_services in RESOURCES.items():
        directory = COOLIFY / label
        compose = read(directory / "compose.yml")
        env_example = read(directory / ".env.example")
        validate_common(label, expected_services, compose, env_example)
        loaded[label] = compose
        envs[label] = env_example

    for label in ("bootstrap", "faucet-tools", "validator"):
        require(
            "${AEKO_IMAGE_TAG:?" in loaded[label],
            f"{label} must require an explicit immutable AEKO image tag",
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
    registry = service_block(bootstrap, "registry")

    require("source: /data/aeko/keys" in key_bootstrap, "key bootstrap must own the fixed key path")
    require(
        "AEKO_ALLOW_CHAIN_KEY_GENERATION: ${AEKO_ALLOW_CHAIN_KEY_GENERATION:-0}" in key_bootstrap,
        "key bootstrap must fail closed unless first-boot generation is explicit",
    )
    for name, block in (("Social", social), ("Protocol", protocol)):
        require(
            "AEKO_RPC_URL: ${AEKO_RPC_URL:?Set the active chain RPC URL}" in block,
            f"{name} bootstrap must consume only the active environment RPC",
        )
        require(
            "key-bootstrap:" in block and "condition: service_completed_successfully" in block,
            f"{name} bootstrap must wait for key preflight",
        )
        require('restart: "no"' in block, f"{name} bootstrap must remain one-shot")

    require("image: nginx:1.27-alpine" in registry, "registry must use the pinned minimal nginx image")
    require("source: /data/aeko/social-state" in registry, "registry must read Social state")
    require("source: /data/aeko/protocol-state" in registry, "registry must read Protocol state")
    require("source: /data/aeko/keys" not in registry, "registry must never mount private chain keys")
    require(registry.count("read_only: true") >= 2, "registry state mounts must be read-only")
    require("location = /social-registry.env" in registry, "registry must expose the Social registry")
    require("location = /protocol-registry.env" in registry, "registry must expose the Protocol registry")
    require("location / {" in registry and "return 404;" in registry, "registry must deny every other path")
    require('"8089"' in registry, "registry must expose container port 8089")

    faucet_tools = loaded["faucet-tools"]
    faucet = service_block(faucet_tools, "faucet")
    wallet_tools = service_block(faucet_tools, "wallet-tools")
    require(
        '"${AEKO_FAUCET_HOST_PORT:-9900}:9900"' in faucet,
        "Faucet must publish raw TCP 9900 for a remote Validator",
    )
    require("AEKO_FAUCET_BIND_IP" not in faucet_tools, "Faucet must not require an IP-specific bind variable")
    require("source: /data/aeko/keys" in faucet, "Faucet must read the persistent key store")
    require('profiles: ["ops"]' in wallet_tools, "wallet tools must remain opt-in operator tooling")
    require("AEKO_NETWORK=" in envs["faucet-tools"], "Faucet env example must identify its chain environment")

    validator = loaded["validator"]
    require("AEKO_NETWORK: ${AEKO_NETWORK:?" in validator, "Validator must declare one active chain environment")
    require(
        "AEKO_FAUCET_ADDRESS: ${AEKO_FAUCET_ADDRESS:-faucet.aeko.online:9900}" in validator,
        "Validator must use the generic active-environment Faucet address",
    )
    require("source: /data/aeko/validator-ledger" in validator, "Validator ledger must use stable host storage")
    require("source: /data/aeko/keys" in validator, "Validator must mount persistent identities")
    require("df -Pk /ledger" in validator, "Validator healthcheck must enforce the low-disk guard")
    require("AEKO_RPC_BIND_IP" not in validator and "AEKO_WS_BIND_IP" not in validator, "RPC/WS must use Coolify domains")
    require('"8899"' in validator and '"8900"' in validator, "Validator must expose RPC/WS container ports")
    require(
        "AEKO_PUBLIC_IP=<validator-public-ip>" in envs["validator"],
        "raw gossip must keep its explicit advertised IP until the validator CLI supports DNS there",
    )

    explorer_api = loaded["explorer-api"]
    for expected in (
        "AEKO_NETWORK: ${AEKO_NETWORK:?",
        "AEKO_RPC_URL: ${AEKO_RPC_URL:?",
        "AEKO_REGISTRY_URL: ${AEKO_REGISTRY_URL:?",
    ):
        require(expected in explorer_api, f"Explorer API missing active-environment contract: {expected}")
    require("DATABASE_URL: ${EXPLORER_DATABASE_URL:?" in explorer_api, "Explorer API must require PostgreSQL")
    require("volumes:" not in explorer_api, "Explorer API must not require bootstrap-host filesystem mounts")
    require("ports:" not in explorer_api, "Explorer API HTTP ingress must be routed by its domain")
    require("AEKO_REGISTRY_SCHEMA_VERSION" not in explorer_api, "Explorer API must not require copied registry values")
    for name in ("AEKO_NETWORK", "AEKO_RPC_URL", "AEKO_EXPLORER_API_URL", "AEKO_REGISTRY_URL"):
        require(f"{name}=" in envs["explorer-api"], f"Explorer API env example missing {name}")

    explorer_ui = loaded["explorer-ui"]
    require("depends_on:" not in explorer_ui, "Scan must remain independently deployable")
    for expected in (
        "AEKO_NETWORK: ${AEKO_NETWORK:?",
        "AEKO_RPC_URL: ${AEKO_RPC_URL:?",
        "AEKO_WS_URL: ${AEKO_WS_URL:?",
        "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:?",
        "AEKO_MAINNET_RPC_URL:",
        "AEKO_TESTNET_RPC_URL:",
        "AEKO_DEVNET_RPC_URL:",
    ):
        require(expected in explorer_ui, f"Scan missing multi-network contract: {expected}")
    require(
        "AEKO_DEVNET_EXPLORER_API_URL=" in envs["explorer-ui"],
        "Scan env example must support a real remote devnet",
    )

    operations = loaded["operations-web"]
    require("depends_on:" not in operations, "Operations Web must remain independently deployable")
    for expected in (
        "AEKO_NETWORK: ${AEKO_NETWORK:?",
        "AEKO_RPC_URL: ${AEKO_RPC_URL:?",
        "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:?",
    ):
        require(expected in operations, f"Operations Web missing active-environment contract: {expected}")

    print("split Coolify single-network + Scan multi-network contract: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
