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
FUNDING_HTTP_E2E = ROOT / "apps" / "explorer" / "backend" / "tests" / "funding_http_e2e.rs"
FUNDING_DESIGN = ROOT / "docs" / "superpowers" / "specs" / "2026-09-25-funding-scan-cleanup-design.md"
FAUCET_REPLAY_TEST = ROOT / "faucet" / "tests" / "local-faucet.rs"
ADMIN_FUNDING_CLIENT = ROOT / "apps" / "admin" / "src" / "lib" / "funding-api.ts"
ADMIN_FUNDING_ROUTE = ROOT / "apps" / "admin" / "src" / "app" / "api" / "admin" / "funding" / "requests" / "route.ts"
NETWORK_CONFIG = ROOT / "apps" / "explorer" / "web" / "src" / "utils" / "networkConfig.js"
NETWORK_TOGGLE = ROOT / "apps" / "explorer" / "web" / "src" / "components" / "NetworkToggle.jsx"
REGISTRY_RESOLVER = ROOT / "apps" / "explorer" / "backend" / "src" / "infrastructure" / "registry.rs"
REGISTRY_FEATURE = ROOT / "apps" / "explorer" / "backend" / "src" / "features" / "registry.rs"
SPLIT_BOOTSTRAP = ROOT / "docker" / "coolify" / "bootstrap" / "compose.yml"
PROTOCOL_INTEGRATION = ROOT / "scripts" / "ci-protocol-stack-integration.sh"
SMART_CONTRACT_RUN = ROOT / ".github" / "actions" / "devops" / "smart-contracts" / "run.sh"
FUNDING_SMOKE = ROOT / "scripts" / "smoke-funding-e2e.py"
HELLO_PROGRAM_SMOKE = ROOT / "scripts" / "smoke-hello-program.py"
README = ROOT / "README.md"
DEPLOYMENT = ROOT / "DEPLOYMENT.md"
DEPLOY_HELPER = ROOT / "scripts" / "deploy-testnet.sh"
BACKEND_GUIDE = ROOT / "BACKEND-DEV-GUIDE.md"
TESTNET_RUNBOOK = ROOT / "docs" / "operations" / "testnet-runbook.md"
NETWORK_PORTS = ROOT / "docs" / "operations" / "network-ports-and-domains.md"
TESTNET_ENVIRONMENT = ROOT / "docs" / "aeko-chain" / "testnet-mainnet.md"
SDK_TESTNET_GUIDE = ROOT / "docs" / "developer-sdk" / "deploy-and-invoke-testnet.md"
WRITE_FIRST_PROGRAM = ROOT / "docs" / "developer-sdk" / "write-your-first-program.md"
RUST_SDK_GUIDE = ROOT / "docs" / "developer-sdk" / "rust-sdk.md"
HELLO_PROGRAM_MANIFEST = ROOT / "contracts" / "hello-aeko-program" / "Cargo.toml"
ADMIN_README = ROOT / "apps" / "admin" / "README.md"
SCAN_README = ROOT / "apps" / "explorer" / "web" / "README.md"
ADMIN_LOGIN = ROOT / "apps" / "admin" / "src" / "app" / "login" / "page.tsx"
ADMIN_SIDEBAR = ROOT / "apps" / "admin" / "src" / "components" / "sidebar.tsx"
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
    funding_http_e2e = read(FUNDING_HTTP_E2E)
    funding_design = read(FUNDING_DESIGN)
    faucet_replay_test = read(FAUCET_REPLAY_TEST)
    admin_funding_client = read(ADMIN_FUNDING_CLIENT)
    admin_funding_route = read(ADMIN_FUNDING_ROUTE)
    network_config = read(NETWORK_CONFIG)
    network_toggle = read(NETWORK_TOGGLE)
    registry_resolver = read(REGISTRY_RESOLVER)
    registry_feature = read(REGISTRY_FEATURE)
    split_bootstrap = read(SPLIT_BOOTSTRAP)
    protocol_integration = read(PROTOCOL_INTEGRATION)
    smart_contract_run = read(SMART_CONTRACT_RUN)
    funding_smoke = read(FUNDING_SMOKE)
    hello_program_smoke = read(HELLO_PROGRAM_SMOKE)
    readme = read(README)
    deployment = read(DEPLOYMENT)
    deploy_helper = read(DEPLOY_HELPER)
    backend_guide = read(BACKEND_GUIDE)
    testnet_runbook = read(TESTNET_RUNBOOK)
    network_ports = read(NETWORK_PORTS)
    testnet_environment = read(TESTNET_ENVIRONMENT)
    sdk_testnet_guide = read(SDK_TESTNET_GUIDE)
    write_first_program = read(WRITE_FIRST_PROGRAM)
    rust_sdk_guide = read(RUST_SDK_GUIDE)
    hello_program_manifest = read(HELLO_PROGRAM_MANIFEST)
    admin_readme = read(ADMIN_README)
    scan_readme = read(SCAN_README)
    admin_login = read(ADMIN_LOGIN)
    admin_sidebar = read(ADMIN_SIDEBAR)
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

    # Protocol bootstrap belongs to exactly one chain environment and
    # must refuse an economically impossible mainnet tokenomics state.
    for label, compose in (
        ("portable", portable),
        ("Dokploy", dokploy),
        ("Coolify", coolify),
    ):
        protocol = service_block(compose, "protocol-bootstrap")
        require(
            "AEKO_NETWORK:" in protocol,
            f"{label} protocol bootstrap must receive the active network identity",
        )
    require(
        "AEKO_NETWORK=localnet" in protocol_integration,
        "live protocol integration must identify its bootstrap network",
    )
    require(
        "mainnet protocol bootstrap is blocked" in protocol_bootstrap
        and "governed_supply_fits_native_balance" in protocol_bootstrap,
        "protocol bootstrap must fail closed when signed-off mainnet supply cannot fit native balances",
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

    # Split registry discovery must be real wiring, not only environment
    # variables in Compose. Explorer consumes the remote documents and the
    # public registry root exposes only a non-secret discovery manifest.
    for required in (
        "AEKO_REGISTRY_URL",
        "social-registry.env",
        "protocol-registry.env",
        "fetch_registry_document",
        "using stale cached bootstrap registry",
    ):
        require(required in registry_resolver, f"Explorer registry resolver missing {required}")
    require(
        "location = /" in split_bootstrap
        and "aeko-bootstrap-registry" in split_bootstrap
        and "social-registry.env" in split_bootstrap
        and "protocol-registry.env" in split_bootstrap,
        "split Bootstrap registry must expose a safe root discovery manifest",
    )
    require(
        'Router::new().route("/registry", get(get_registry_index))' in registry_feature
        and '"/registry/social"' in registry_feature
        and '"/registry/protocol"' in registry_feature,
        "Explorer API must expose a non-secret registry discovery endpoint",
    )
    require(
        'AEKO_REGISTRY_URL="$REGISTRY_URL"' in protocol_integration
        and '"/registry"' in protocol_integration
        and '"/registry/social"' in protocol_integration
        and '"/registry/protocol"' in protocol_integration
        and "Explorer registry discovery and remote Social/Protocol registry consumption passed"
        in protocol_integration,
        "live protocol-stack integration must exercise registry discovery and remote registry consumption",
    )

    # Public Scan selection is a product surface, not a list of every
    # deployable development environment.
    require(
        "PUBLIC_NETWORK_ORDER = ['mainnet', 'testnet']" in network_toggle,
        "Aeko Scan public selector must expose Mainnet and Testnet only",
    )
    require(
        "name: 'Devnet'" not in network_config,
        "public Scan network configuration must not expose Devnet",
    )
    require(
        "PUBLIC_NETWORK_ORDER = ['mainnet', 'testnet']" in network_config,
        "public Scan runtime must normalize only Mainnet and Testnet",
    )
    require(
        "RUNTIME_CONFIG_PATH = '/runtime-config.js'" in explorer_proxy
        and "pathname === RUNTIME_CONFIG_PATH" in explorer_proxy
        and "'no-store, max-age=0'" in explorer_proxy,
        "Scan runtime configuration must not be cached across deployments",
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
        "target.network !== 'testnet'" in explorer_proxy
        and "return FUNDING_WRITE_PATHS.has(suffix)" in explorer_proxy,
        "Scan proxy must allow funding writes only on Testnet and reject all non-funding POSTs",
    )
    require(
        "MAX_PROXY_BODY_BYTES" in explorer_proxy
        and "Funding writes require application/json" in explorer_proxy,
        "Scan proxy must bound and type-check public funding bodies",
    )

    # Raw bootstrap registry and product-facing registry discovery are distinct.
    # The bootstrap root is a non-secret manifest; only its two generated env
    # documents and health probe are otherwise routable. Product clients use
    # Explorer API /registry* routes instead of guessing raw bootstrap paths.
    require(
        "location = / {" in split_bootstrap
        and '"service":"aeko-bootstrap-registry"' in split_bootstrap
        and "location = /social-registry.env" in split_bootstrap
        and "location = /protocol-registry.env" in split_bootstrap
        and "location / {" in split_bootstrap
        and "return 404;" in split_bootstrap,
        "split bootstrap registry must expose discovery/root plus exact registry documents and deny unknown paths",
    )
    for required in (
        '.route("/registry", get(get_registry_index))',
        'social: "/registry/social"',
        'protocol: "/registry/protocol"',
    ):
        require(
            required in registry_feature,
            f"Explorer registry discovery contract missing {required}",
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
    for required in (
        "submission_blockhash",
        "FUNDING_SUBMISSION_RETRY_PENDING",
        "recover_processing_grant_submission",
        "recover_processing_airdrop_submission",
    ):
        require(
            required in funding_feature,
            f"Explorer funding recovery contract missing {required}",
        )
    require(
        "blockhash_calls.load(Ordering::SeqCst),\n        1" in funding_http_e2e
        and "processing_grant_replays_only_persisted_intent" in funding_http_e2e,
        "funding HTTP E2E must prove response-loss recovery reuses the persisted blockhash",
    )
    require(
        "expired_submitted_grant_becomes_terminal_failed_without_fresh_intent" in funding_http_e2e
        and "isBlockhashValid" in read(
            ROOT / "apps" / "explorer" / "backend" / "src" / "infrastructure" / "chain.rs"
        ),
        "funding E2E must prove an expired unobserved intent becomes terminal without a fresh transfer",
    )
    require(
        "test_same_airdrop_intent_produces_same_signed_transaction" in faucet_replay_test
        and "assert_eq!(first.signatures, replay.signatures)" in faucet_replay_test,
        "Faucet tests must prove identical funding intent has a deterministic signature",
    )
    funding_design_flat = " ".join(funding_design.split())
    require(
        "FUNDING_SUBMISSION_RETRY_PENDING" in funding_design_flat
        and "persisted transaction intent" in funding_design_flat
        and "same destination, amount, funding authorization and recent blockhash" in funding_design_flat
        and "same transaction signature" in funding_design_flat
        and "after that blockhash expires" in funding_design_flat
        and "searches transaction history" in funding_design_flat
        and "Neither Scan nor Admin may manually retry it" in funding_design_flat
        and "never substitutes a fresh blockhash" in funding_design_flat,
        "funding design must document backend-owned deterministic replay",
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
        "before = balance(recipient)",
        "after = balance(recipient)",
        "confirmed grant balance delta",
        '"/admin/funding/grants?limit=500"',
        '"/funding/airdrop"',
        '"/admin/funding/airdrops?limit=500"',
        "developer airdrop leaked into the confirmed grant ledger",
    ):
        require(
            required in protocol_integration,
            f"live protocol-stack funding dogfood missing contract: {required}",
        )

    # Deployable SBF contracts have an independent CI ownership boundary.
    # A compile-only example is insufficient: the smart-contract lane must build
    # SBF and delegate real CLI deploy/invoke verification to the Hello smoke.
    for forbidden in (
        "contracts/hello-aeko-program",
        "cargo-build-sbf",
        "smoke-hello-program.py",
    ):
        require(
            forbidden not in protocol_integration,
            f"network protocol integration must not own deployable smart-contract work: {forbidden}",
        )
    for required in (
        "contracts/hello-aeko-program/Cargo.toml",
        "cargo-build-sbf",
        "hello_aeko_program.so",
        "https://rpc.aeko.online",
        "https://scan.aeko.online/api/explorer/testnet",
        "/funding/airdrop",
        "aeko-keygen new",
        "smoke-hello-program.py",
    ):
        require(
            required in smart_contract_run,
            f"smart-contract CI gate missing contract: {required}",
        )
    for required in (
        '"program"',
        '"deploy"',
        '"getAccountInfo"',
        '"commitment": "finalized"',
        '"getSignatureStatuses"',
        '"getTransaction"',
        '"Hello from AEKO!"',
        '"invoke_hello"',
    ):
        require(
            required in hello_program_smoke,
            f"Hello World smoke missing runtime proof: {required}",
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

    # Repository documentation must be portable and must not silently revive
    # retired funding/developer contracts. The dated cleanup design is the one
    # deliberate exception because it records the names that were removed.
    historical_funding_design = FUNDING_DESIGN.resolve()
    for doc_path in (ROOT / "docs").rglob("*"):
        if not doc_path.is_file() or doc_path.suffix.lower() not in {".md", ".mdx", ".txt"}:
            continue
        doc_text = read(doc_path)
        require(
            "/Users/" not in doc_text
            and "/home/" not in doc_text
            and "Documents/projects/aeko-chain" not in doc_text,
            f"{doc_path.relative_to(ROOT)} contains a machine-specific local repository path",
        )
        reject(doc_text, "fund.aeko.online", str(doc_path.relative_to(ROOT)))
        reject(doc_text, "Funding Portal", str(doc_path.relative_to(ROOT)))
        reject(doc_text, "cargo build-bpf", str(doc_path.relative_to(ROOT)))
        if doc_path.resolve() != historical_funding_design:
            for retired_doc_contract in (
                "AEKO_OPERATIONS_ROLE",
                "FUNDING_GATEWAY_KEY",
                "AEKO_INTERNAL_FUNDING_URL",
                "AEKO_PUBLIC_FUNDING_URL",
                "AEKO_LOCALNET_FUNDING_URL",
            ):
                reject(
                    doc_text,
                    retired_doc_contract,
                    str(doc_path.relative_to(ROOT)),
                )

    # Documentation and user-facing navigation must match the running
    # architecture. The Faucet may have a raw TCP hostname in split deployment,
    # but it is never a browser/application funding endpoint.
    for where, text in (
        ("README", readme),
        ("DEPLOYMENT", deployment),
        ("backend guide", backend_guide),
        ("testnet runbook", testnet_runbook),
        ("network ports", network_ports),
        ("testnet environment", testnet_environment),
        ("SDK testnet guide", sdk_testnet_guide),
        ("Admin README", admin_readme),
        ("Scan README", scan_readme),
    ):
        reject(text, "fund.aeko.online", where)
        reject(text, "FUNDING_GATEWAY_KEY", where)
        reject(text, "AEKO_INTERNAL_FUNDING_URL", where)
        reject(text, "AEKO_OPERATIONS_ROLE", where)

    reject(testnet_environment, "Funding Portal", "testnet environment")
    reject(sdk_testnet_guide, "cargo build-bpf", "SDK testnet guide")
    reject(write_first_program, "cargo build-bpf", "write-first-program guide")
    reject(write_first_program, "/Users/ok/Documents/projects/aeko-chain", "write-first-program guide")
    reject(rust_sdk_guide, "cargo build-bpf", "Rust SDK guide")
    reject(rust_sdk_guide, "/Users/ok/Documents/projects/aeko-chain", "Rust SDK guide")
    reject(scan_readme, "Operations Web funding role", "Scan README")
    reject(sdk_testnet_guide, "/Users/ok/Documents/projects/aeko-chain", "SDK testnet guide")
    reject(admin_login, 'href="/funding"', "Admin login")
    reject(admin_sidebar, 'href="/funding"', "Admin sidebar")
    reject(admin_env, "AEKO_OPERATIONS_ROLE", "Admin env example")

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
    require(
        "Public testnet funding uses the managed Explorer funding flow." in testnet_runbook
        and "It is not the public-testnet funding contract." in testnet_runbook,
        "testnet runbook must route public funding through Explorer and reserve direct airdrop for local/custom validators",
    )
    require(
        "The Explorer backend owns settlement" in sdk_testnet_guide,
        "SDK testnet guide must identify Explorer as the settlement authority",
    )
    require(
        "Aeko Scan's same-origin Explorer funding API" in testnet_environment
        and "authenticated Operations Admin approval" in testnet_environment,
        "network environment docs must describe the current public grant boundary",
    )
    require(
        "### Registry discovery" in testnet_environment
        and "GET /registry" in testnet_environment
        and "GET /registry/social" in testnet_environment
        and "GET /registry/protocol" in testnet_environment
        and "Unknown paths return" in testnet_environment
        and "404" in testnet_environment,
        "network environment docs must distinguish raw bootstrap registry paths from Explorer product registry routes",
    )
    require(
        "There is **no separate public Funding Gateway service/domain" in network_ports
        and "firewall it to Validator source addresses" in network_ports,
        "network port docs must distinguish the retired gateway from raw Faucet transport",
    )
    require(
        "./cargo-build-sbf" in sdk_testnet_guide
        and "scripts/smoke-hello-program.py" in sdk_testnet_guide
        and "Hello from AEKO!" in sdk_testnet_guide,
        "SDK testnet guide must document the repository SBF build and live invoke proof",
    )
    require(
        "./cargo-build-sbf" in write_first_program
        and "AEKO Smart Contracts (non-blocking)" in write_first_program
        and "Hello from AEKO!" in write_first_program,
        "write-first-program guide must match the non-blocking live Hello World smart-contract gate",
    )
    require(
        "./cargo-build-sbf" in rust_sdk_guide
        and "contracts/hello-aeko-program" in rust_sdk_guide
        and "aeko-test-validator" in rust_sdk_guide,
        "Rust SDK guide must use the same SBF/deploy contract proven by CI",
    )
    require(
        "Smart-contract build/deploy/invoke works in CI." in testnet_runbook
        and "AEKO Smart Contracts (non-blocking)" in testnet_runbook
        and "https://rpc.aeko.online" in testnet_runbook
        and "/funding/airdrop" in testnet_runbook,
        "testnet runbook must document the non-blocking live smart-contract compatibility gate",
    )
    require(
        "explorer-ui:4000" in testnet_runbook
        and "explorer-ui:3000" not in testnet_runbook,
        "testnet runbook canonical Scan port must match the 4000 runtime listener",
    )
    require(
        'base64 = "0.21.7"' in hello_program_manifest,
        "Hello World invoke example must declare its direct base64 dev dependency",
    )

    print("[PASS] AEKO deployment, funding authority, docs and dogfood contracts are internally consistent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
