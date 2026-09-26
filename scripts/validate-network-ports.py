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

SPLIT_RESOURCES = (
    "bootstrap",
    "faucet-tools",
    "validator",
    "explorer-api",
    "explorer-ui",
    "operations-web",
)


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

    # One authoritative domain/port map. Funding is same-origin through Scan,
    # not a resurrected separate Funding Gateway service.
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
            "/api/explorer/testnet/funding/*",
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
    for resource in SPLIT_RESOURCES:
        compose_path = COOLIFY / resource / "compose.yml"
        env_path = COOLIFY / resource / ".env.example"
        compose = read(compose_path)
        env_text = read(env_path)
        require_all_interpolations_documented(
            str(compose_path.relative_to(ROOT)),
            compose,
            env_text,
        )
        split[resource] = compose
        split_envs[resource] = env_text

    # Same-Compose deployments keep service-DNS defaults while allowing the
    # operator to override the same generic env variable with a routed domain.
    for path in SHARED_COMPOSES:
        compose = read(path)
        require_contains_all(
            str(path.relative_to(ROOT)),
            compose,
            (
                "AEKO_RPC_URL: ${AEKO_RPC_URL:-http://validator:8899}",
                "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:-http://explorer-api:8088}",
                "AEKO_FAUCET_ADDRESS: ${AEKO_FAUCET_ADDRESS:-faucet:9900}",
            ),
        )
        explorer = service_block(compose, "explorer-api")
        require(
            "AEKO_WS_URL: ${AEKO_WS_URL:-ws://validator:8900}" in explorer,
            f"{path.name} Explorer API must keep an overridable validator WebSocket default",
        )
        operations = service_block(compose, "operations-web")
        require(
            "AEKO_NETWORK:" in operations,
            f"{path.name} Operations Web must receive the same AEKO_NETWORK consumed by Admin code",
        )

    # Public Scan cannot send browser RPC/WS traffic to Docker-only validator
    # service names. Its active defaults are the routed testnet domains, while
    # the server-side Explorer API upstream remains independently overrideable.
    for path in (ROOT / "docker" / "compose.dokploy.yml", ROOT / "docker" / "compose.coolify.yml"):
        scan = service_block(read(path), "explorer-ui")
        require_contains_all(
            f"{path.name} Scan",
            scan,
            (
                "AEKO_RPC_URL: ${AEKO_RPC_URL:-https://rpc.aeko.online}",
                "AEKO_WS_URL: ${AEKO_WS_URL:-wss://ws.aeko.online}",
                "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:-http://explorer-api:8088}",
            ),
        )

    # Split Coolify cross-resource dependencies use explicit active-environment
    # endpoints; Coolify domains route HTTP/WSS straight to exposed container
    # ports. Faucet and gossip remain raw transport.
    require_contains_all(
        "split Explorer API",
        split["explorer-api"],
        (
            "AEKO_NETWORK: ${AEKO_NETWORK:?",
            "AEKO_RPC_URL: ${AEKO_RPC_URL:?",
            "AEKO_WS_URL: ${AEKO_WS_URL:-}",
            "AEKO_REGISTRY_URL: ${AEKO_REGISTRY_URL:?",
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
            '- "4000"',
        ),
    )
    require_contains_all(
        "split Operations Web",
        split["operations-web"],
        (
            "AEKO_NETWORK: ${AEKO_NETWORK:?",
            "AEKO_RPC_URL: ${AEKO_RPC_URL:?",
            "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:?",
            '- "3001"',
        ),
    )
    require_contains_all(
        "split Validator",
        split["validator"],
        (
            "AEKO_FAUCET_ADDRESS: ${AEKO_FAUCET_ADDRESS:-faucet.aeko.online:9900}",
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

    # Runtime config generation and Vite dev mode consume chain RPC/WS plus the
    # Explorer API. The production proxy server only needs network identity and
    # Explorer API upstreams; it must not require RPC/WS it never calls.
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
        "Scan proxy server",
        scan_server,
        (
            "AEKO_NETWORK",
            "AEKO_EXPLORER_API_URL",
        ),
    )

    for name in (
        "AEKO_MAINNET_EXPLORER_API_URL",
        "AEKO_TESTNET_EXPLORER_API_URL",
        "AEKO_DEVNET_EXPLORER_API_URL",
    ):
        require(
            name in scan_server or "network.toUpperCase()" in scan_entrypoint or "network.toUpperCase()" in scan_vite,
            f"Scan multi-network runtime must support {name}",
        )

    print("[PASS] AEKO network ports/domains/env contract is internally consistent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
