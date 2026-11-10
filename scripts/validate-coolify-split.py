#!/usr/bin/env python3
"""Static invariants for independently deployable Coolify resources."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COOLIFY = ROOT / "docker" / "coolify"
DOCKERFILE = ROOT / "docker" / "Dockerfile"
BOOTSTRAP_ENTRYPOINT = ROOT / "docker" / "bootstrap-entrypoint.sh"

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
        ["explorer-api", "editor-runner"],
    ),
    "explorer-ui": (
        ROOT / "apps" / "explorer" / "web" / "compose.coolify.yml",
        ROOT / "apps" / "explorer" / "web" / ".env.coolify.example",
        ["explorer-ui"],
    ),
    "editor-web": (
        ROOT / "apps" / "explorer" / "editor" / "compose.coolify.yml",
        ROOT / "apps" / "explorer" / "editor" / ".env.coolify.example",
        ["editor-web"],
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
    top_level = re.search(r"^(?:networks|volumes):\s*$", tail, re.MULTILINE)
    if top_level:
        tail = tail[: top_level.start()]
    return re.findall(r"^  ([A-Za-z0-9_.-]+):\s*$", tail, re.MULTILINE)


def service_block(compose: str, service: str) -> str:
    match = re.search(rf"^  {re.escape(service)}:\s*$", compose, re.MULTILINE)
    require(match is not None, f"missing service block: {service}")
    tail = compose[match.end() :]
    boundary = re.search(
        r"^(?:  [A-Za-z0-9_.-]+:|networks:|volumes:)\s*$",
        tail,
        re.MULTILINE,
    )
    return tail[: boundary.start()] if boundary else tail


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

    for retired in ("explorer-api", "explorer-ui", "editor-web", "operations-web"):
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

    for label in ("explorer-api", "explorer-ui", "editor-web", "operations-web"):
        require(
            "${AEKO_IMAGE_TAG:-latest}" in loaded[label],
            f"{label} must support post-promotion latest-tag application deploys",
        )

    dockerfile = read(DOCKERFILE)
    bootstrap_entrypoint = read(BOOTSTRAP_ENTRYPOINT)
    for target, binary in (
        ("social-bootstrap", "aeko-social-bootstrap"),
        ("protocol-bootstrap", "aeko-protocol-bootstrap"),
    ):
        target_match = re.search(
            rf"^FROM rust-runtime AS {re.escape(target)}$(.*?)(?=^FROM |\Z)",
            dockerfile,
            re.MULTILINE | re.DOTALL,
        )
        require(target_match is not None, f"Dockerfile target missing: {target}")
        target_block = target_match.group(1)
        require(
            'ENTRYPOINT ["/usr/local/bin/aeko-bootstrap-entrypoint"]' in target_block,
            f"{target} must use the image-owned bootstrap entrypoint",
        )
        require(
            f'CMD ["{binary}"]' in target_block,
            f"{target} must declare its one-shot bootstrap binary as CMD",
        )
    require(
        'rm -f -- "$ready_path"' in bootstrap_entrypoint
        and '"$@"' in bootstrap_entrypoint
        and 'cp "$binding_path" "$ready_tmp"' in bootstrap_entrypoint
        and 'mv -f "$ready_tmp" "$ready_path"' in bootstrap_entrypoint,
        "bootstrap entrypoint must invalidate stale readiness and publish it atomically only after success",
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
            "AEKO_RPC_URL: ${AEKO_RPC_URL:-}" in block,
            f"{name} bootstrap must use the private Validator RPC contract",
        )
        if name == "Protocol":
            require(
                "AEKO_NETWORK: ${AEKO_NETWORK:?Set mainnet, testnet, devnet, or localnet}"
                in block,
                "Protocol bootstrap must receive the same single active network identity",
            )
            require(
                "AEKO_PROTOCOL_MIGRATE_EMERGENCY_MULTISIG_PDA: ${AEKO_PROTOCOL_MIGRATE_EMERGENCY_MULTISIG_PDA:-0}"
                in block,
                "Protocol bootstrap must expose the explicit legacy multisig migration gate",
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
            "entrypoint: null" in block,
            f"{label} bootstrap must explicitly restore the image-owned entrypoint so stale platform overrides are cleared",
        )
        require(
            f'command: ["{binary}"]' in block,
            f"{label} bootstrap must set an explicit exec-form binary command so stale platform commands are replaced",
        )
        require(
            'entrypoint: ["/bin/sh", "-ec"]' not in block and "\n      - -ec\n" not in block,
            f"{label} bootstrap command must not reintroduce a Compose shell wrapper",
        )
        require(
            ".aeko-bootstrap-runtime-ready" not in block,
            f"{label} bootstrap readiness lifecycle must not be duplicated in Compose",
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
        'target: 9900' in faucet
        and 'published: "${AEKO_FAUCET_HOST_PORT:-9900}"' in faucet
        and 'host_ip: "${AEKO_FAUCET_BIND_ADDRESS:?' in faucet
        and 'protocol: tcp' in faucet,
        "Faucet must publish raw TCP 9900 on an explicit Validator-reachable host interface",
    )
    require(
        re.search(r"^AEKO_FAUCET_BIND_ADDRESS=$", envs["faucet-tools"], re.MULTILINE) is not None,
        "Faucet env example must require an explicit host bind address for split deployment",
    )
    for forbidden_bind in ("127.0.0.1", "localhost", "::1"):
        require(
            f"AEKO_FAUCET_BIND_ADDRESS={forbidden_bind}" not in envs["faucet-tools"],
            f"split Faucet must not default its host publication to loopback ({forbidden_bind})",
        )
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
        "AEKO_FAUCET_ADDRESS: ${AEKO_FAUCET_ADDRESS:-}" in validator
        and 'AEKO_REQUIRE_REMOTE_FAUCET: "1"' in validator,
        "Validator must pass the private raw Faucet endpoint and fail closed when it is absent",
    )
    require(
        "AEKO_FAUCET_ADDRESS:?Set " not in validator,
        "Validator must not use message-bearing Coolify interpolation for the Faucet endpoint",
    )
    require("source: /data/aeko/validator-ledger" in validator, "Validator ledger must use stable host storage")
    require("source: /data/aeko/keys" in validator, "Validator must mount persistent identities")
    require("df -Pk /ledger" in validator, "Validator healthcheck must enforce the low-disk guard")
    require("AEKO_RPC_BIND_IP" not in validator and "AEKO_WS_BIND_IP" not in validator, "RPC/WS must use Coolify domains")
    require('"8899"' in validator and '"8900"' in validator, "Validator must expose RPC/WS container ports")
    require(
        "AEKO_GOSSIP_HOST: ${AEKO_GOSSIP_HOST:-}" in validator
        and 'AEKO_REQUIRE_GOSSIP_HOST: "1"' in validator,
        "split Validator must require an explicit network-specific gossip hostname",
    )
    require(
        re.search(r"^AEKO_GOSSIP_HOST=$", envs["validator"], re.MULTILINE) is not None
        and "Testnet uses gossip.aeko.online" in envs["validator"],
        "Validator env example must leave gossip explicit while documenting the testnet hostname",
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
        "AEKO_RPC_URL: ${AEKO_RPC_URL:-}",
        "AEKO_WS_URL: ${AEKO_WS_URL:-}",
        "AEKO_REGISTRY_URL: ${AEKO_REGISTRY_URL:-}",
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
        "AEKO_RPC_URL",
        "AEKO_WS_URL",
        "AEKO_REGISTRY_URL",
        "AEKO_EXPLORER_CORS_ORIGINS",
    ):
        require(f"{name}=" in envs["explorer-api"], f"Explorer API env example missing {name}")
    require(
        "AEKO_EXPLORER_CORS_ORIGINS: ${AEKO_EXPLORER_CORS_ORIGINS:-}" in explorer_api,
        "Explorer API split resource must pass the browser CORS allowlist through for application validation",
    )
    explorer_service = service_block(explorer_api, "explorer-api")
    editor_runner = service_block(explorer_api, "editor-runner")
    require(
        "AEKO_EDITOR_RUNNER_URL: http://editor-runner:8090" in explorer_service
        and "editor-runner:" in explorer_service
        and "condition: service_healthy" in explorer_service,
        "Explorer API must reach the editor runner only through its private service contract",
    )
    require(
        "ports:" not in editor_runner and 'expose:\n      - "8090"' in editor_runner,
        "editor runner must not publish a host port",
    )
    for isolation_contract in (
        "read_only: true",
        "cap_drop:",
        "- ALL",
        "no-new-privileges:true",
        "/work:rw,nosuid",
        "/tmp:rw,nosuid,noexec",
        "pids_limit:",
        "mem_limit:",
        "cpus:",
        "- editor-internal",
    ):
        require(
            isolation_contract in editor_runner,
            f"editor runner missing isolation control: {isolation_contract}",
        )
    require(
        re.search(r"^networks:\s*\n  editor-internal:\s*\n    internal: true\s*$", explorer_api, re.MULTILINE)
        is not None,
        "editor runner network must remain internal-only",
    )
    for forbidden_prompt in (
        "AEKO_RPC_URL:?Set ",
        "AEKO_REGISTRY_URL:?Set ",
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

    editor = loaded["editor-web"]
    require("depends_on:" not in editor, "Contract Studio must remain independently deployable")
    require(
        "aeko-editor-web:${AEKO_IMAGE_TAG:-latest}" in editor,
        "Contract Studio split resource must consume the promoted aeko-editor-web image",
    )
    for expected in (
        "AEKO_EDITOR_PUBLIC_ORIGIN: ${AEKO_EDITOR_PUBLIC_ORIGIN:-https://editor.aeko.online}",
        "AEKO_EDITOR_ACCESS_TOKEN:",
        "AEKO_RPC_URL: ${AEKO_RPC_URL:-https://rpc.aeko.online}",
        "AEKO_WS_URL: ${AEKO_WS_URL:-wss://ws.aeko.online}",
        "read_only: true",
        "cap_drop:",
        "- ALL",
        "- CHOWN",
        "- DAC_OVERRIDE",
        "- SETUID",
        "- SETGID",
        "no-new-privileges:true",
        "/workspaces:rw,nosuid,nodev",
        "http://127.0.0.1:4100/healthz",
    ):
        require(expected in editor, f"Contract Studio missing isolation/deployment contract: {expected}")
    for forbidden in (
        "/var/run/docker.sock",
        "EXPLORER_DATABASE_URL",
        "AEKO_KEYS_DIR",
        "/data/aeko/keys",
    ):
        require(forbidden not in editor, f"Contract Studio must not expose privileged host/runtime state: {forbidden}")

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
        "AEKO_RPC_URL: ${AEKO_RPC_URL:-}",
        "AEKO_EXPLORER_API_URL: ${AEKO_EXPLORER_API_URL:-}",
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
