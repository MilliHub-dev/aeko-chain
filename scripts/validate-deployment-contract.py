#!/usr/bin/env python3
"""Static acceptance checks for AEKO deployment and funding boundaries."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCKER = ROOT / "docker"
PORTABLE = DOCKER / "compose.local.yml"
DOKPLOY = DOCKER / "compose.dokploy.yml"
COOLIFY = DOCKER / "compose.coolify.yml"
DOCKERFILE = DOCKER / "Dockerfile"
VALIDATOR_ENTRYPOINT = DOCKER / "validator-entrypoint.sh"
KEY_PREFLIGHT = DOCKER / "key-preflight.sh"
EXPLORER_ENTRYPOINT = DOCKER / "explorer-ui-entrypoint.sh"
EXPLORER_PROXY = DOCKER / "explorer-ui-server.mjs"
PUBLIC_ENV = DOCKER / "env.public.example"
ADMIN_ENV = ROOT / "apps" / "admin" / ".env.local.example"
EXPLORER_ENV = ROOT / "apps" / "explorer" / "backend" / ".env.example"
FUNDING_FEATURE = ROOT / "apps" / "explorer" / "backend" / "src" / "features" / "funding" / "mod.rs"
FUNDING_CONFIG = ROOT / "apps" / "explorer" / "backend" / "src" / "config" / "mod.rs"
ADMIN_FUNDING_CLIENT = ROOT / "apps" / "admin" / "src" / "lib" / "funding-api.ts"
ADMIN_FUNDING_ROUTE = ROOT / "apps" / "admin" / "src" / "app" / "api" / "admin" / "funding" / "requests" / "route.ts"
NETWORK_CONFIG = ROOT / "apps" / "explorer" / "web" / "src" / "utils" / "networkConfig.js"
PROTOCOL_INTEGRATION = ROOT / "scripts" / "ci-protocol-stack-integration.sh"
FUNDING_SMOKE = ROOT / "scripts" / "smoke-funding-e2e.py"
README = ROOT / "README.md"
DEPLOYMENT = ROOT / "DEPLOYMENT.md"
DEPLOY_HELPER = ROOT / "scripts" / "deploy-testnet.sh"
BACKEND_GUIDE = ROOT / "BACKEND-DEV-GUIDE.md"
TESTNET_RUNBOOK = ROOT / "docs" / "operations" / "testnet-runbook.md"
PROTOCOL_BOOTSTRAP = ROOT / "protocol-bootstrap" / "src" / "main.rs"
SOCIAL_BOOTSTRAP = ROOT / "social-bootstrap" / "src" / "main.rs"
BOOTSTRAP_LIFECYCLE = ROOT / "bootstrap-common" / "lifecycle.rs"
BUILTINS = ROOT / "runtime" / "src" / "builtins.rs"
FEATURE_SET = ROOT / "sdk" / "src" / "feature_set.rs"


class ContractFailure(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractFailure(message)


def reject(text: str, needle: str, where: str) -> None:
    require(needle not in text, f"{where} contains retired contract {needle!r}")


def read(path: Path) -> str:
    require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def service_block(compose: str, service: str) -> str:
    start = re.search(rf"^  {re.escape(service)}:\s*$", compose, re.MULTILINE)
    require(start is not None, f"missing service {service}")
    tail = compose[start.end() :]
    stop = re.search(
        r"^(?:  [A-Za-z0-9_.-]+:|networks:|volumes:)\s*$",
        tail,
        re.MULTILINE,
    )
    return tail[: stop.start()] if stop else tail


def require_service(compose: str, service: str, label: str) -> str:
    block = service_block(compose, service)
    require(block.strip(), f"{label} {service} service is empty")
    return block


def main() -> int:
    portable = read(PORTABLE)
    dokploy = read(DOKPLOY)
    coolify = read(COOLIFY)
    dockerfile = read(DOCKERFILE)
    validator_entrypoint = read(VALIDATOR_ENTRYPOINT)
    key_preflight = read(KEY_PREFLIGHT)
    explorer_entrypoint = read(EXPLORER_ENTRYPOINT)
    explorer_proxy = read(EXPLORER_PROXY)
    public_env = read(PUBLIC_ENV)
    admin_env = read(ADMIN_ENV)
    explorer_env = read(EXPLORER_ENV)
    funding_feature = read(FUNDING_FEATURE)
    funding_config = read(FUNDING_CONFIG)
    admin_funding_client = read(ADMIN_FUNDING_CLIENT)
    admin_funding_route = read(ADMIN_FUNDING_ROUTE)
    network_config = read(NETWORK_CONFIG)
    protocol_integration = read(PROTOCOL_INTEGRATION)
    funding_smoke = read(FUNDING_SMOKE)
    readme = read(README)
    deployment = read(DEPLOYMENT)
    deploy_helper = read(DEPLOY_HELPER)
    backend_guide = read(BACKEND_GUIDE)
    testnet_runbook = read(TESTNET_RUNBOOK)
    protocol_bootstrap = read(PROTOCOL_BOOTSTRAP)
    social_bootstrap = read(SOCIAL_BOOTSTRAP)
    bootstrap_lifecycle = read(BOOTSTRAP_LIFECYCLE)
    builtins = read(BUILTINS)
    feature_set = read(FEATURE_SET)

    # One image recipe owns every runtime role.
    for target in (
        "validator",
        "faucet",
        "social-bootstrap",
        "protocol-bootstrap",
        "tools",
        "explorer-api",
        "explorer-ui",
        "operations-web",
    ):
        require(
            re.search(rf"^FROM .* AS {re.escape(target)}$", dockerfile, re.MULTILINE)
            is not None,
            f"Dockerfile target missing: {target}",
        )

    # The retired dedicated Funding Gateway must not return in any deployable
    # topology. Funding policy/state is owned by Explorer API/PostgreSQL.
    retired_funding_contracts = (
        "funding-gateway",
        "FUNDING_GATEWAY_KEY",
        "AEKO_FUNDING_GATEWAY_KEY",
        "FUNDING_ADMIN_API_KEY",
        "FUNDING_CLIENT_API_KEY",
        "AEKO_INTERNAL_FUNDING_URL",
        "AEKO_OPERATIONS_ROLE",
        "admin-state",
    )
    for label, compose in (
        ("portable", portable),
        ("Dokploy", dokploy),
        ("Coolify", coolify),
    ):
        for retired in retired_funding_contracts:
            reject(compose, retired, f"{label} compose")

    # Local and public all-in-one contracts expose the same service ownership.
    portable_services = (
        "faucet",
        "validator",
        "rpc-node",
        "social-bootstrap",
        "protocol-bootstrap",
        "explorer-api",
        "explorer-ui",
        "operations-web",
    )
    public_services = (
        "faucet",
        "validator",
        "social-bootstrap",
        "protocol-bootstrap",
        "explorer-api",
        "explorer-ui",
        "operations-web",
        "wallet-tools",
    )
    for service in portable_services:
        require_service(portable, service, "portable")
    for label, compose in (("Dokploy", dokploy), ("Coolify", coolify)):
        require(
            re.search(r"^\s+build:\s*$", compose, re.MULTILINE) is None,
            f"{label} must pull published images instead of building source",
        )
        for service in public_services:
            block = require_service(compose, service, label)
            require("image:" in block, f"{label} {service} must use a published image")
            require(
                "pull_policy: always" in block,
                f"{label} {service} must pull the selected image tag",
            )

    require('profiles: ["rpc"]' in service_block(portable, "rpc-node"), "portable RPC replica must remain opt-in")
    require(
        re.search(r"^  rpc-node:\s*$", dokploy, re.MULTILINE) is None
        and re.search(r"^  rpc-node:\s*$", coolify, re.MULTILINE) is None,
        "public single-validator topologies must not require the optional RPC replica",
    )

    # Persistent identity and bootstrap lifecycle remain fail-closed.
    require(
        'REQUIRE_EXISTING_LEDGER=${AEKO_REQUIRE_EXISTING_LEDGER:-0}' in validator_entrypoint,
        "validator entrypoint must expose the existing-ledger guard",
    )
    require(
        "refusing to create a replacement genesis" in validator_entrypoint,
        "validator entrypoint must fail closed instead of silently replacing genesis",
    )
    require(
        "refusing to generate a replacement chain identity" in key_preflight,
        "key preflight must fail closed on missing established chain identities",
    )
    require(
        "refusing to replace an established protocol authority" in key_preflight,
        "key preflight must preserve established protocol authority identity",
    )
    require(
        "protocol registry and continuity anchor disagree" in key_preflight,
        "key preflight must reject split protocol identity",
    )
    require(
        "ResumeReset" in bootstrap_lifecycle
        and "Schema-less or unbound registries are unsupported" in bootstrap_lifecycle,
        "bootstrap lifecycle must resume interrupted resets while rejecting unbound registries",
    )
    require(
        "protect_existing_registry" in social_bootstrap
        and "protect_existing_registry" in protocol_bootstrap,
        "Social/Protocol bootstrap must protect established registry state",
    )

    # Native token and permission programs stay feature-gated.
    require(
        builtins.count("feature_id: Some(feature_set::aeko_token_programs_v1::id())")
        == 5,
        "exactly five token native programs must share the token feature gate",
    )
    require(
        builtins.count("feature_id: Some(feature_set::aeko_permission_layer_v1::id())")
        == 6,
        "exactly six permission/security native programs must share the permission feature gate",
    )
    require(
        "aeko_token_programs_v1" in feature_set
        and "aeko_permission_layer_v1" in feature_set,
        "runtime feature set must define both AEKO protocol feature gates",
    )

    # Funding authorization is server-only and shared only between Validator
    # and the Explorer API for the same deployed test network.
    for label, compose in (
        ("portable", portable),
        ("Dokploy", dokploy),
        ("Coolify", coolify),
    ):
        validator = service_block(compose, "validator")
        explorer = service_block(compose, "explorer-api")
        operations = service_block(compose, "operations-web")
        explorer_ui = service_block(compose, "explorer-ui")
        faucet = service_block(compose, "faucet")

        require(
            "AEKO_FUNDING_AUTHORIZATION_KEY:" in validator,
            f"{label} Validator must receive funding authorization",
        )
        require(
            "AEKO_FUNDING_AUTHORIZATION_KEY:" in explorer,
            f"{label} Explorer API must receive matching funding authorization",
        )
        require(
            "AEKO_FUNDING_REQUESTS_PER_10_MIN:" in explorer,
            f"{label} Explorer API must receive the funding rate-limit policy",
        )
        require(
            "AEKO_FUNDING_RECONCILE_INTERVAL_SECS:" in explorer,
            f"{label} Explorer API must receive the settlement reconciliation cadence",
        )
        require(
            "AEKO_FAUCET_PER_REQUEST_CAP:" in explorer,
            f"{label} Explorer API must mirror the Faucet request ceiling",
        )
        require(
            "--per-request-cap" in faucet,
            f"{label} Faucet must enforce its own hard per-request ceiling",
        )
        require(
            "AEKO_FUNDING_AUTHORIZATION_KEY" not in operations
            and "AEKO_FUNDING_AUTHORIZATION_KEY" not in explorer_ui,
            f"{label} funding authorization must never reach Operations/browser runtime",
        )

        require(
            "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN:" in explorer
            and "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN:" in operations,
            f"{label} Explorer and Operations must share the private settings token",
        )
        require(
            "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN" not in explorer_ui,
            f"{label} settings token must never reach Scan browser runtime",
        )
        require(
            "AEKO_EXPLORER_API_URL:" in operations,
            f"{label} Operations must call Explorer API directly",
        )

    require(
        "AEKO_FUNDING_AUTHORIZATION_KEY=" in public_env
        and "AEKO_FUNDING_RECONCILE_INTERVAL_SECS=" in public_env
        and "AEKO_FAUCET_PER_REQUEST_CAP=" in public_env,
        "public environment template must document funding authorization, reconciliation and Faucet cap",
    )
    require(
        "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN=" in admin_env
        and "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN=" in explorer_env,
        "Admin and Explorer env examples must document the shared private settings token",
    )
    require(
        "AEKO_FUNDING_AUTHORIZATION_KEY" not in network_config
        and "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN" not in network_config
        and "AEKO_FUNDING_AUTHORIZATION_KEY" not in explorer_entrypoint
        and "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN" not in explorer_entrypoint,
        "server-only funding/settings secrets must never enter browser runtime configuration",
    )

    # Scan is a constrained same-origin proxy: reads plus two explicit
    # test-network funding writes only, with all mainnet writes denied.
    require(
        "const FUNDING_WRITE_PATHS = new Set(['/funding/request', '/funding/airdrop'])"
        in explorer_proxy,
        "Scan proxy must enumerate its two public funding writes",
    )
    require(
        "target.network === 'mainnet'" in explorer_proxy
        and "return FUNDING_WRITE_PATHS.has(suffix)" in explorer_proxy,
        "Scan proxy must fail closed for mainnet writes and all non-funding POSTs",
    )
    require(
        "MAX_PROXY_BODY_BYTES" in explorer_proxy
        and "Funding writes require application/json" in explorer_proxy,
        "Scan proxy must bound and type-check public funding bodies",
    )

    # Explorer owns durable policy/state and the Admin boundary.
    for required in (
        '"/funding/policy"',
        '"/funding/request"',
        '"/funding/airdrop"',
        '"/admin/funding/settings"',
        '"/admin/funding/requests"',
        '"/admin/funding/grant"',
        "authorize_admin",
        "ensure_test_environment",
        "run_settlement_reconciler",
        "reconcile_submitted_settlements_once",
    ):
        require(required in funding_feature, f"Explorer funding module missing {required}")
    require(
        'matches!(self.network.as_str(), "testnet" | "devnet" | "localnet")'
        in read(ROOT / "apps" / "explorer" / "backend" / "src" / "http" / "state.rs"),
        "Explorer funding must distinguish test environments from mainnet",
    )
    require(
        "AEKO_FUNDING_AUTHORIZATION_KEY is required" in funding_config
        and "AEKO_FUNDING_RECONCILE_INTERVAL_SECS" in funding_config,
        "Explorer config must require settlement authorization and define reconciliation cadence",
    )

    require(
        "x-aeko-settings-token" in admin_funding_client
        and "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN" in admin_funding_client,
        "Operations funding client must authenticate server-to-server Explorer mutations",
    )
    require(
        "approve" in admin_funding_route
        and "reject" in admin_funding_route
        and "reconcile" in admin_funding_route,
        "Operations funding route must expose explicit grant decisions/reconciliation",
    )

    # Real CI dogfood must exercise the protected chain path, not only mocks.
    for required in (
        "AEKO_FUNDING_AUTHORIZATION_KEY",
        "protected requestAirdrop unexpectedly accepted",
        '"/funding/request"',
        '"/admin/funding/requests/{request_id}/decide"',
        "wallet balance",
        '"/admin/funding/grants?limit=500"',
        '"/funding/airdrop"',
        '"/admin/funding/airdrops?limit=500"',
        "developer airdrop leaked into the confirmed grant ledger",
    ):
        require(
            required in protocol_integration,
            f"live protocol-stack funding dogfood missing contract: {required}",
        )

    for required in (
        "AEKO_SCAN_URL",
        "AEKO_OPERATIONS_URL",
        "AEKO_RPC_URL",
        "AEKO_FUNDING_SMOKE_ADDRESS",
        "ADMIN_PASSWORD",
        "Scan cannot approve grants",
        "wallet balance increased",
        "exactly one confirmed grant",
    ):
        require(
            required in funding_smoke,
            f"deployed funding smoke missing contract: {required}",
        )

    # The documented deploy helper must start the same topology as Compose.
    for retired in (
        "funding-gateway",
        "AEKO_PUBLIC_FUNDING_URL",
        "aeko-funding-gateway",
        ":3002",
    ):
        reject(deploy_helper, retired, "deploy-testnet helper")
    require(
        "explorer-api explorer-ui operations-web" in deploy_helper,
        "deploy-testnet helper must start Explorer API/UI and Operations Web without a funding sidecar",
    )
    require(
        "/api/explorer/${AEKO_NETWORK}/funding/*" in deploy_helper,
        "deploy-testnet helper must advertise the same-origin Scan funding route",
    )

    # Documentation must match the running architecture.
    for where, text in (
        ("README", readme),
        ("DEPLOYMENT", deployment),
        ("backend guide", backend_guide),
        ("testnet runbook", testnet_runbook),
    ):
        reject(text, "fund.aeko.online", where)
        reject(text, "faucet.aeko.online", where)
        reject(text, "FUNDING_GATEWAY_KEY", where)
        reject(text, "AEKO_INTERNAL_FUNDING_URL", where)

    require(
        "There is no separate Funding Gateway runtime." in readme,
        "README must explicitly document Explorer-owned funding",
    )
    require(
        "mainnet funding controls fail closed" in readme,
        "README must preserve the mainnet governance boundary",
    )
    require(
        "scripts/smoke-funding-e2e.py" in testnet_runbook,
        "testnet runbook must document the deployed product funding smoke",
    )

    print("[PASS] AEKO deployment, funding authority and dogfood contracts are internally consistent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
