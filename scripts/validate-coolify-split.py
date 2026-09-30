#!/usr/bin/env python3
"""Static invariants for independently deployable Coolify resources."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COOLIFY = ROOT / "docker" / "coolify"

RESOURCES = {
    "bootstrap": (
        COOLIFY / "bootstrap" / "compose.yml",
        COOLIFY / "bootstrap" / ".env.example",
        ["key-bootstrap", "social-bootstrap", "protocol-bootstrap", "registry"],
    ),
    "faucet-tools": (
        COOLIFY / "faucet-tools" / "compose.yml",
        COOLIFY / "faucet-tools" / ".env.example",
        ["faucet", "wallet-tools"],
    ),
    "validator": (
        COOLIFY / "validator" / "compose.yml",
        COOLIFY / "validator" / ".env.example",
        ["validator"],
    ),
    "explorer-api": (
        ROOT / "apps" / "explorer" / "backend" / "compose.coolify.yml",
        ROOT / "apps" / "explorer" / "backend" / ".env.coolify.example",
        ["explorer-api"],
    ),
    "explorer-ui": (
        ROOT / "apps" / "explorer" / "web" / "compose.coolify.yml",
        ROOT / "apps" / "explorer" / "web" / ".env.coolify.example",
        ["explorer-ui"],
    ),
    "operations-web": (
        ROOT / "apps" / "admin" / "compose.coolify.yml",
        ROOT / "apps" / "admin" / ".env.coolify.example",
        ["operations-web"],
    ),
}

RETIRED_ENDPOINT_NAMES = (
    "AEKO_ENV",
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
    for label, (compose_path, env_path, expected_services) in RESOURCES.items():
        compose = read(compose_path)
        env_example = read(env_path)
        validate_common(label, expected_services, compose, env_example)
        loaded[label] = compose
        envs[label] = env_example

    for retired in ("explorer-api", "explorer-ui", "operations-web"):
        require(
            not (COOLIFY / retired / "compose.yml").exists()
            and not (COOLIFY / retired / ".env.example").exists(),
            f"{retired} Coolify ownership must live beside its application under apps/",
        )

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
            "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:?Set private or DNS-only Validator RPC URL}" in block,
            f"{name} bootstrap must use the private Validator RPC contract",
        )
        if name == "Protocol":
            require(
                "AEKO_NETWORK: ${AEKO_NETWORK:?Set mainnet, testnet, devnet, or localnet}"
                in block,
                "Protocol bootstrap must receive the same single active network identity",
            )
        require(
            "key-bootstrap:" in block and "condition: service_completed_successfully" in block,
            f"{name} bootstrap must wait for key preflight",
        )
        require('restart: "no"' in block, f"{name} bootstrap must remain one-shot")

    for label, block, binary in (
        ("Social", social, "aeko-social-bootstrap"),
        ("Protocol", protocol, "aeko-protocol-bootstrap"),
    ):
        require(
            'entrypoint: ["/bin/sh", "-ec"]' in block,
            f"{label} bootstrap must wrap the one-shot binary with split-runtime readiness gating",
        )
        require(
            "rm -f /state/.aeko-bootstrap-runtime-ready" in block,
            f"{label} bootstrap must invalidate stale runtime readiness before verification",
        )
        require(binary in block, f"{label} bootstrap wrapper must execute {binary}")
        require(
            "cp /state/.aeko-chain-binding /state/.aeko-bootstrap-runtime-ready" in block,
            f"{label} bootstrap may publish runtime readiness only after lifecycle completion",
        )

    require("image: nginx:1.27-alpine" in registry, "registry must use the pinned minimal nginx image")
    require("source: /data/aeko/social-state" in registry, "registry must read Social state")
    require("source: /data/aeko/protocol-state" in registry, "registry must read Protocol state")
    require("source: /data/aeko/keys" not in registry, "registry must never mount private chain keys")
    require(registry.count("read_only: true") >= 2, "registry state mounts must be read-only")
    require("location = /social-registry.env" in registry, "registry must expose the Social registry")
    require("location = /protocol-registry.env" in registry, "registry must expose the Protocol registry")
    for required_health_guard in (
        "/registry/social/.aeko-bootstrap-runtime-ready",
        "/registry/protocol/.aeko-bootstrap-runtime-ready",
        "/registry/social/social-registry.env",
        "/registry/protocol/protocol-registry.env",
    ):
        require(
            required_health_guard in registry,
            f"registry /healthz must fail closed when {required_health_guard} is unavailable",
        )
    require('return 503 "social bootstrap not verified' in registry, "registry health must surface failed Social verification")
    require('return 503 "protocol bootstrap not verified' in registry, "registry health must surface failed Protocol verification")
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
    require("curl " not in faucet and "wget " not in faucet, "Faucet healthcheck must never send HTTP to raw TCP 9900")
    require("traefik.http" not in faucet, "Faucet must never declare an HTTP reverse-proxy route")
    require('profiles: ["ops"]' in wallet_tools, "wallet tools must remain opt-in operator tooling")
    require("AEKO_NETWORK=" in envs["faucet-tools"], "Faucet env example must identify its chain environment")
    require(
        "AEKO_NETWORK=" in envs["bootstrap"],
        "Bootstrap env example must identify its chain environment",
    )

    validator = loaded["validator"]
    require("AEKO_NETWORK: ${AEKO_NETWORK:?" in validator, "Validator must declare one active chain environment")
    require(
        "AEKO_FAUCET_ADDRESS: ${AEKO_INTERNAL_FAUCET_ADDRESS:?Set a private or DNS-only Faucet host:9900}" in validator,
        "Validator must require the private raw Faucet endpoint",
    )
    require("source: /data/aeko/validator-ledger" in validator, "Validator ledger must use stable host storage")
    require("source: /data/aeko/keys" in validator, "Validator must mount persistent identities")
    require("df -Pk /ledger" in validator, "Validator healthcheck must enforce the low-disk guard")
    require("AEKO_RPC_BIND_IP" not in validator and "AEKO_WS_BIND_IP" not in validator, "RPC/WS must use Coolify domains")
    require('"8899"' in validator and '"8900"' in validator, "Validator must expose RPC/WS container ports")
    require(
        "AEKO_GOSSIP_HOST=gossip.aeko.online" in envs["validator"],
        "Validator env example must advertise the canonical gossip DNS hostname",
    )
    require(
        "AEKO_FUNDING_AUTHORIZATION_KEY:" in validator,
        "Validator must accept the server-side funding authorization key",
    )

    explorer_api = loaded["explorer-api"]
    require(
        "AEKO_EXPLORER_LOG_FORMAT:" in explorer_api
        and "AEKO_EXPLORER_LOG_FILTER:" in explorer_api,
        "Explorer API split resource must configure production application logging",
    )
    for expected in (
        "AEKO_NETWORK: ${AEKO_NETWORK:-}",
        "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:-}",
        "AEKO_WS_URL: ${AEKO_INTERNAL_WS_URL:-}",
        "AEKO_REGISTRY_URL: ${AEKO_INTERNAL_REGISTRY_URL:-}",
        'AEKO_REQUIRE_REMOTE_REGISTRY: "1"',
    ):
        require(expected in explorer_api, f"Explorer API missing private upstream contract: {expected}")
    require("DATABASE_URL: ${EXPLORER_DATABASE_URL:-}" in explorer_api, "Explorer API must pass PostgreSQL through for application validation")
    require("volumes:" not in explorer_api, "Explorer API must not require bootstrap-host filesystem mounts")
    require("ports:" not in explorer_api, "Explorer API HTTP ingress must be routed by its domain")
    require("AEKO_REGISTRY_SCHEMA_VERSION" not in explorer_api, "Explorer API must not require copied registry values")
    for funding_name in (
        "AEKO_FUNDING_AUTHORIZATION_KEY",
        "AEKO_FUNDING_REQUESTS_PER_10_MIN",
        "AEKO_FUNDING_RECONCILE_INTERVAL_SECS",
        "AEKO_FAUCET_PER_REQUEST_CAP",
    ):
        require(
            f"{funding_name}:" in explorer_api,
            f"Explorer API missing funding control {funding_name}",
        )
    require(
        "AEKO_SCAN_AIRDROP_KEY" not in explorer_api,
        "Explorer API must not retain the retired Scan-only airdrop key",
    )
    for name in (
        "AEKO_NETWORK",
        "AEKO_INTERNAL_RPC_URL",
        "AEKO_INTERNAL_WS_URL",
        "AEKO_INTERNAL_REGISTRY_URL",
        "AEKO_EXPLORER_CORS_ORIGINS",
    ):
        require(f"{name}=" in envs["explorer-api"], f"Explorer API env example missing {name}")
    require(
        "AEKO_EXPLORER_CORS_ORIGINS: ${AEKO_EXPLORER_CORS_ORIGINS:-}" in explorer_api,
        "Explorer API split resource must pass the browser CORS allowlist through for application validation",
    )
    for forbidden_prompt in (
        "AEKO_INTERNAL_RPC_URL:?Set ",
        "AEKO_INTERNAL_REGISTRY_URL:?Set ",
        "AEKO_EXPLORER_CORS_ORIGINS:?Set ",
        "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN:?Set ",
        "EXPLORER_DATABASE_URL:?Set ",
    ):
        require(
            forbidden_prompt not in explorer_api,
            f"Explorer API must not use message-bearing Coolify interpolation: {forbidden_prompt}",
        )

    explorer_ui = loaded["explorer-ui"]
    require(
        "AEKO_LOG_FORMAT:" in explorer_ui and "AEKO_LOG_LEVEL:" in explorer_ui,
        "Scan split resource must configure production application logging",
    )
    require("depends_on:" not in explorer_ui, "Scan must remain independently deployable")
    for expected in (
        "AEKO_NETWORK: ${AEKO_NETWORK:?",
        "AEKO_RPC_URL: ${AEKO_RPC_URL:?",
        "AEKO_WS_URL: ${AEKO_WS_URL:?",
        "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:?",
        "AEKO_MAINNET_RPC_URL:",
        "AEKO_MAINNET_EXPLORER_API_URL:",
        "AEKO_TESTNET_RPC_URL:",
        "AEKO_TESTNET_EXPLORER_API_URL:",
    ):
        require(expected in explorer_ui, f"Scan missing public-network contract: {expected}")
    for retired_proxy_name in (
        "AEKO_EXPLORER_PROXY_UPSTREAM_URL",
        "AEKO_MAINNET_EXPLORER_PROXY_UPSTREAM_URL",
        "AEKO_TESTNET_EXPLORER_PROXY_UPSTREAM_URL",
    ):
        require(
            retired_proxy_name not in explorer_ui and retired_proxy_name not in envs["explorer-ui"],
            f"public Scan must not expose retired proxy variable {retired_proxy_name}",
        )
    for private_prefix in ("AEKO_DEVNET_", "AEKO_LOCALNET_", "AEKO_DEMO_"):
        require(
            private_prefix not in explorer_ui and private_prefix not in envs["explorer-ui"],
            f"public Scan must not expose {private_prefix} deployment variables",
        )

    operations = loaded["operations-web"]
    admin_middleware = read(ROOT / "apps" / "admin" / "src" / "middleware.ts")
    admin_health_route = read(ROOT / "apps" / "admin" / "src" / "app" / "healthz" / "route.ts")
    require(
        "AEKO_LOG_FORMAT:" in operations and "AEKO_LOG_LEVEL:" in operations,
        "Operations Web split resource must configure production application logging",
    )
    require("depends_on:" not in operations, "Operations Web must remain independently deployable")
    for expected in (
        "AEKO_NETWORK: ${AEKO_NETWORK:?",
        "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:?",
        "AEKO_EXPLORER_API_URL: ${AEKO_INTERNAL_EXPLORER_API_URL:?",
        "AEKO_ADMIN_EXPLORER_TIMEOUT_MS:",
    ):
        require(expected in operations, f"Operations Web missing private upstream contract: {expected}")

    for label in ("bootstrap", "explorer-api", "operations-web"):
        combined = loaded[label] + "\n" + envs[label]
        require(
            "https://rpc.aeko.online" not in combined,
            f"{label} must not hairpin server RPC through the public edge",
        )
    require(
        "https://api.aeko.online" not in envs["operations-web"],
        "Operations Web must not hairpin Explorer mutations through the public edge",
    )

    require(
        "http://127.0.0.1:3001/healthz" in operations,
        "Operations Web container healthcheck must use the dedicated public /healthz route",
    )
    require(
        "pathname === '/healthz'" in admin_middleware
        and "return nextWithRequestId(req, requestId)" in admin_middleware,
        "Operations Web middleware must bypass Admin authentication and request logging for /healthz",
    )
    require(
        "return new Response('ok\\n'" in admin_health_route
        and "'cache-control': 'no-store'" in admin_health_route,
        "Operations Web /healthz route must return a non-cacheable liveness response",
    )

    print("split Coolify single-network + Scan multi-network contract: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
