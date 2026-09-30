#!/usr/bin/env python3
"""Validate AEKO network ports, domains, Compose env coverage, and consumers."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SHARED_COMPOSES = (
    ROOT / "docker" / "compose.local.yml",
    ROOT / "docker" / "compose.dokploy.yml",
    ROOT / "docker" / "compose.coolify.yml",
)
SHARED_ENV = ROOT / "docker" / "env.public.example"
PORT_DOC = ROOT / "docs" / "operations" / "network-ports-and-domains.md"
COOLIFY = ROOT / "docker" / "coolify"

SPLIT_RESOURCES = {
    "bootstrap": (
        COOLIFY / "bootstrap" / "compose.yml",
        COOLIFY / "bootstrap" / ".env.example",
    ),
    "faucet-tools": (
        COOLIFY / "faucet-tools" / "compose.yml",
        COOLIFY / "faucet-tools" / ".env.example",
    ),
    "validator": (
        COOLIFY / "validator" / "compose.yml",
        COOLIFY / "validator" / ".env.example",
    ),
    "explorer-api": (
        ROOT / "apps" / "explorer" / "backend" / "compose.coolify.yml",
        ROOT / "apps" / "explorer" / "backend" / ".env.coolify.example",
    ),
    "explorer-ui": (
        ROOT / "apps" / "explorer" / "web" / "compose.coolify.yml",
        ROOT / "apps" / "explorer" / "web" / ".env.coolify.example",
    ),
    "operations-web": (
        ROOT / "apps" / "admin" / "compose.coolify.yml",
        ROOT / "apps" / "admin" / ".env.coolify.example",
    ),
}


class ContractFailure(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractFailure(message)


def read(path: Path) -> str:
    require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def interpolated_names(text: str) -> set[str]:
    return set(re.findall(r"\$\{([A-Z][A-Z0-9_]*)", text))


def documented_names(text: str) -> set[str]:
    return set(re.findall(r"^([A-Z][A-Z0-9_]*)=", text, re.MULTILINE))


def service_block(compose: str, service: str) -> str:
    start = re.search(rf"^  {re.escape(service)}:\s*$", compose, re.MULTILINE)
    require(start is not None, f"missing Compose service {service}")
    tail = compose[start.end() :]
    stop = re.search(r"^(?:  [A-Za-z0-9_.-]+:|networks:|volumes:)\s*$", tail, re.MULTILINE)
    return tail[: stop.start()] if stop else tail


def require_all_interpolations_documented(label: str, compose: str, env_text: str) -> None:
    missing = sorted(interpolated_names(compose) - documented_names(env_text))
    require(not missing, f"{label} env example is missing Compose variables: {missing}")


def require_contains_all(label: str, text: str, values: tuple[str, ...]) -> None:
    for value in values:
        require(value in text, f"{label} missing required contract value: {value}")


def main() -> int:
    port_doc = read(PORT_DOC)
    shared_env = read(SHARED_ENV)

    # One authoritative domain/port map. Public Scan calls the Explorer API
    # directly; there is no resurrected separate Funding Gateway service.
    require_contains_all(
        "network port/domain documentation",
        port_doc,
        (
            "https://rpc.aeko.online",
            "8899/tcp",
            "wss://ws.aeko.online",
            "8900/tcp",
            "https://api.aeko.online",
            "8088/tcp",
            "https://registry.aeko.online",
            "8089/tcp",
            "https://scan.aeko.online",
            "4000/tcp",
            "https://admin.aeko.online",
            "3001/tcp",
            "faucet.aeko.online:9900",
            "9900/tcp",
            "gossip.aeko.online:8001",
            "8000-8050/tcp+udp",
            "5432/tcp",
            "https://api.aeko.online/funding/*",
            "There is **no separate public Funding Gateway service/domain",
        ),
    )
    require("fund.aeko.online" not in port_doc, "canonical port map must not advertise retired fund.aeko.online")

    # Every shared local/Dokploy/legacy-Coolify Compose interpolation must be
    # declared in the shared env template.
    for path in SHARED_COMPOSES:
        require_all_interpolations_documented(
            str(path.relative_to(ROOT)),
            read(path),
            shared_env,
        )

    # Every split Coolify resource owns a complete adjacent env example.
    split: dict[str, str] = {}
    split_envs: dict[str, str] = {}
    for resource, (compose_path, env_path) in SPLIT_RESOURCES.items():
        compose = read(compose_path)
        env_text = read(env_path)
        require_all_interpolations_documented(
            str(compose_path.relative_to(ROOT)),
            compose,
            env_text,
        )
        split[resource] = compose
        split_envs[resource] = env_text

    # Local Compose may still override generic endpoints for custom developer
    # topologies. Public all-in-one deployments use a separate internal
    # namespace so public URLs cannot redirect server traffic through the edge.
    local_compose = read(ROOT / "docker" / "compose.local.yml")
    require_contains_all(
        "docker/compose.local.yml",
        local_compose,
        (
            "AEKO_RPC_URL: ${AEKO_RPC_URL:-http://validator:8899}",
            "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:-http://explorer-api:8088}",
            "AEKO_FAUCET_ADDRESS: ${AEKO_FAUCET_ADDRESS:-faucet:9900}",
        ),
    )

    for path in (ROOT / "docker" / "compose.dokploy.yml", ROOT / "docker" / "compose.coolify.yml"):
        compose = read(path)
        require_contains_all(
            str(path.relative_to(ROOT)),
            compose,
            (
                "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}",
                "AEKO_FAUCET_ADDRESS: ${AEKO_INTERNAL_FAUCET_ADDRESS:-faucet:9900}",
            ),
        )
        explorer = service_block(compose, "explorer-api")
        require(
            "AEKO_WS_URL: ${AEKO_INTERNAL_WS_URL:-ws://validator:8900}" in explorer,
            f"{path.name} Explorer API must use the internal validator WebSocket namespace",
        )
        require(
            "AEKO_EXPLORER_CORS_ORIGINS:" in explorer,
            f"{path.name} Explorer API must declare the browser CORS allowlist",
        )
        operations = service_block(compose, "operations-web")
        require(
            "AEKO_NETWORK:" in operations
            and "AEKO_EXPLORER_API_URL: ${AEKO_INTERNAL_EXPLORER_API_URL:-http://explorer-api:8088}" in operations
            and "AEKO_EXPLORER_PROXY_TIMEOUT_MS:" in operations,
            f"{path.name} Operations Web must use the private Explorer API with the funding-safe timeout",
        )
        scan = service_block(compose, "explorer-ui")
        require_contains_all(
            f"{path.name} Scan",
            scan,
            (
                "AEKO_RPC_URL: ${AEKO_RPC_URL:-https://rpc.aeko.online}",
                "AEKO_WS_URL: ${AEKO_WS_URL:-wss://ws.aeko.online}",
                "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:-https://api.aeko.online}",
            ),
        )

    # Split server-to-server dependencies use private or DNS-only origins.
    # Public RPC/WS/API domains are for clients and browser runtime only.
    bootstrap_social = service_block(split["bootstrap"], "social-bootstrap")
    bootstrap_protocol = service_block(split["bootstrap"], "protocol-bootstrap")
    for label, block in (
        ("split Social bootstrap", bootstrap_social),
        ("split Protocol bootstrap", bootstrap_protocol),
    ):
        require(
            "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:?Set private or DNS-only Validator RPC URL}" in block,
            f"{label} must use the private Validator RPC contract",
        )

    require_contains_all(
        "split Explorer API",
        split["explorer-api"],
        (
            "AEKO_NETWORK: ${AEKO_NETWORK:?",
            "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:?",
            "AEKO_WS_URL: ${AEKO_INTERNAL_WS_URL:-}",
            "AEKO_REGISTRY_URL: ${AEKO_INTERNAL_REGISTRY_URL:?",
            "AEKO_EXPLORER_CORS_ORIGINS: ${AEKO_EXPLORER_CORS_ORIGINS:?",
            '- "8088"',
        ),
    )
    require("ports:" not in split["explorer-api"], "split Explorer API must use Coolify domain routing, not a host HTTP port")
    require_contains_all(
        "split Scan",
        split["explorer-ui"],
        (
            "AEKO_NETWORK: ${AEKO_NETWORK:?",
            "AEKO_RPC_URL: ${AEKO_RPC_URL:?",
            "AEKO_WS_URL: ${AEKO_WS_URL:?",
            "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:?",
            "AEKO_MAINNET_EXPLORER_API_URL:",
            "AEKO_TESTNET_EXPLORER_API_URL:",
            '- "4000"',
        ),
    )
    require_contains_all(
        "split Operations Web",
        split["operations-web"],
        (
            "AEKO_NETWORK: ${AEKO_NETWORK:?",
            "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:?",
            "AEKO_EXPLORER_API_URL: ${AEKO_INTERNAL_EXPLORER_API_URL:?",
            "AEKO_EXPLORER_PROXY_TIMEOUT_MS:",
            '- "3001"',
        ),
    )
    require_contains_all(
        "split Validator",
        split["validator"],
        (
            "AEKO_FAUCET_ADDRESS: ${AEKO_INTERNAL_FAUCET_ADDRESS:?",
            "AEKO_GOSSIP_HOST: ${AEKO_GOSSIP_HOST:-gossip.aeko.online}",
            '- "8000-8050:8000-8050/tcp"',
            '- "8000-8050:8000-8050/udp"',
            '- "8899"',
            '- "8900"',
        ),
    )
    require_contains_all(
        "split Faucet",
        split["faucet-tools"],
        (
            '- "9900"',
            '"${AEKO_FAUCET_HOST_PORT:-9900}:9900"',
        ),
    )
    require_contains_all(
        "split registry",
        split["bootstrap"],
        (
            "listen 8089;",
            '- "8089"',
            "location = /social-registry.env",
            "location = /protocol-registry.env",
            "source: /data/aeko/social-state",
            "source: /data/aeko/protocol-state",
        ),
    )

    # Application/runtime consumers must read the exact generic names supplied
    # by Compose. Scan alone additionally reads the network-prefixed triplets.
    backend_config = read(ROOT / "apps" / "explorer" / "backend" / "src" / "config" / "mod.rs")
    require_contains_all(
        "Explorer backend config",
        backend_config,
        (
            'required_env("AEKO_NETWORK")',
            'required_env("AEKO_RPC_URL")',
            'optional_env("AEKO_WS_URL")',
        ),
    )

    admin_network = read(ROOT / "apps" / "admin" / "src" / "lib" / "network.ts")
    require_contains_all(
        "Operations Web network resolver",
        admin_network,
        (
            "clean('AEKO_NETWORK')",
            "clean('AEKO_RPC_URL')",
            "clean('AEKO_EXPLORER_API_URL')",
        ),
    )

    api_entrypoint = read(ROOT / "docker" / "explorer-api-entrypoint.sh")
    require_contains_all(
        "Explorer API entrypoint",
        api_entrypoint,
        (
            "${AEKO_NETWORK:-}",
            "${AEKO_REGISTRY_URL:-}",
            "AEKO_SOCIAL_REGISTRY_FILE",
            "AEKO_PROTOCOL_REGISTRY_FILE",
        ),
    )

    scan_entrypoint = read(ROOT / "docker" / "explorer-ui-entrypoint.sh")
    scan_server = read(ROOT / "docker" / "explorer-ui-server.mjs")
    scan_vite = read(ROOT / "apps" / "explorer" / "web" / "vite.config.js")

    # Runtime config generation and Vite dev mode publish chain RPC/WS plus the
    # public Explorer API identity. The production Scan server serves only the
    # SPA/runtime config/telemetry and never forwards Explorer API traffic.
    for label, text in (
        ("Scan entrypoint", scan_entrypoint),
        ("Scan Vite config", scan_vite),
    ):
        require_contains_all(
            label,
            text,
            (
                "AEKO_NETWORK",
                "AEKO_RPC_URL",
                "AEKO_WS_URL",
                "AEKO_EXPLORER_API_URL",
            ),
        )
    require_contains_all(
        "Scan static server",
        scan_server,
        (
            "AEKO_NETWORK",
            "LEGACY_EXPLORER_PROXY_PREFIX",
            "SCAN_EXPLORER_PROXY_REMOVED",
        ),
    )
    for retired_proxy_name in (
        "AEKO_EXPLORER_PROXY_UPSTREAM_URL",
        "AEKO_MAINNET_EXPLORER_PROXY_UPSTREAM_URL",
        "AEKO_TESTNET_EXPLORER_PROXY_UPSTREAM_URL",
    ):
        require(
            retired_proxy_name not in scan_server
            and retired_proxy_name not in split["explorer-ui"]
            and retired_proxy_name not in split_envs["explorer-ui"],
            f"Scan must not retain retired Explorer proxy input {retired_proxy_name}",
        )

    for name in (
        "AEKO_MAINNET_EXPLORER_API_URL",
        "AEKO_TESTNET_EXPLORER_API_URL",
    ):
        require(
            name in scan_server or "network.toUpperCase()" in scan_entrypoint or "network.toUpperCase()" in scan_vite,
            f"Scan public-network runtime must support {name}",
        )
    for private_prefix in ("AEKO_DEVNET_", "AEKO_LOCALNET_", "AEKO_DEMO_"):
        require(
            private_prefix not in split["explorer-ui"] and private_prefix not in split_envs["explorer-ui"],
            f"split Scan must not expose {private_prefix} variables",
        )
    require(
        "RUNTIME_CONFIG_PATH = '/runtime-config.js'" in scan_server
        and "pathname === RUNTIME_CONFIG_PATH" in scan_server
        and "'no-store, max-age=0'" in scan_server,
        "Scan runtime-config.js must bypass browser caching",
    )

    print("[PASS] AEKO network ports/domains/env contract is internally consistent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
