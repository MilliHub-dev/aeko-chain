#!/usr/bin/env python3
"""Static acceptance checks for AEKO's local, Dokploy and Coolify deployment contracts."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCKER_DIR = ROOT / "docker"
PORTABLE = DOCKER_DIR / "compose.local.yml"
DOKPLOY = DOCKER_DIR / "compose.dokploy.yml"
COOLIFY = DOCKER_DIR / "compose.coolify.yml"
DOCKERFILE = DOCKER_DIR / "Dockerfile"
VALIDATOR_ENTRYPOINT = DOCKER_DIR / "validator-entrypoint.sh"
KEY_PREFLIGHT = DOCKER_DIR / "key-preflight.sh"
BLOCKSTORE_CLEANUP = ROOT / "ledger" / "src" / "blockstore_cleanup_service.rs"
SOCIAL_BOOTSTRAP = ROOT / "social-bootstrap" / "src" / "main.rs"
PROTOCOL_BOOTSTRAP = ROOT / "protocol-bootstrap" / "src" / "main.rs"
FEATURE_SET = ROOT / "sdk" / "src" / "feature_set.rs"
BUILTINS = ROOT / "runtime" / "src" / "builtins.rs"
PROTOCOL_SMOKE = ROOT / "scripts" / "smoke-aeko-protocol.py"
PROTOCOL_ACTIVATE = ROOT / "scripts" / "activate-aeko-protocol-features.sh"
PROTOCOL_INTEGRATION = ROOT / "scripts" / "ci-protocol-stack-integration.sh"
EXPLORER_HEALTH = ROOT / "apps" / "explorer" / "backend" / "src" / "features" / "health" / "mod.rs"
README = ROOT / "README.md"
DEPLOYMENT = ROOT / "DEPLOYMENT.md"
ADMIN_ENV = ROOT / "apps" / "admin" / ".env.local.example"
PUBLIC_ENV = DOCKER_DIR / "env.public.example"
EXPLORER_BACKEND_ENV = ROOT / "apps" / "explorer" / "backend" / ".env.example"
EXPLORER_ENTRYPOINT = DOCKER_DIR / "explorer-ui-entrypoint.sh"
NETWORK_CONFIG = ROOT / "apps" / "explorer" / "web" / "src" / "utils" / "networkConfig.js"


class ContractFailure(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractFailure(message)


def read(path: Path) -> str:
    require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def service_block(compose: str, service: str, next_service: str | None = None) -> str:
    start = re.search(rf"^  {re.escape(service)}:\s*$", compose, re.MULTILINE)
    require(start is not None, f"missing service {service}")
    tail = compose[start.end() :]
    if next_service:
        stop = re.search(rf"^  {re.escape(next_service)}:\s*$", tail, re.MULTILINE)
    else:
        stop = re.search(r"^(?:networks|volumes):\s*$", tail, re.MULTILINE)
    return tail[: stop.start()] if stop else tail


def main() -> int:
    portable = read(PORTABLE)
    dokploy = read(DOKPLOY)
    coolify = read(COOLIFY)
    dockerfile = read(DOCKERFILE)
    validator_entrypoint = read(VALIDATOR_ENTRYPOINT)
    key_preflight = read(KEY_PREFLIGHT)
    blockstore_cleanup = read(BLOCKSTORE_CLEANUP)
    social_bootstrap = read(SOCIAL_BOOTSTRAP)
    protocol_bootstrap = read(PROTOCOL_BOOTSTRAP)
    feature_set = read(FEATURE_SET)
    builtins = read(BUILTINS)
    protocol_smoke = read(PROTOCOL_SMOKE)
    protocol_activate = read(PROTOCOL_ACTIVATE)
    protocol_integration = read(PROTOCOL_INTEGRATION)
    explorer_health = read(EXPLORER_HEALTH)
    readme = read(README)
    deployment = read(DEPLOYMENT)
    admin_env = read(ADMIN_ENV)
    public_env = read(PUBLIC_ENV)
    explorer_backend_env = read(EXPLORER_BACKEND_ENV)
    explorer_entrypoint = read(EXPLORER_ENTRYPOINT)
    network_config = read(NETWORK_CONFIG)

    # The settings mutation credential is server-side control-plane state.
    # Explorer API and Operations Web must share it, while the browser runtime
    # must never receive it.
    require(
        "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN=" in admin_env,
        "Operations Web env example must declare the Explorer settings admin token",
    )
    require(
        "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN=" in public_env,
        "deployment env example must declare the Explorer settings admin token",
    )
    require(
        "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN=" in explorer_backend_env,
        "Explorer backend env example must declare the settings admin token",
    )
    for label, compose in (("portable", portable), ("Dokploy", dokploy), ("Coolify", coolify)):
        require(
            compose.count("AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN:") >= 2,
            f"{label} must inject the settings token into Explorer API and Operations Web",
        )
    require(
        "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN" not in network_config
        and "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN" not in explorer_entrypoint,
        "Explorer browser runtime must never receive the settings admin token",
    )

    # One canonical build recipe, with all role-specific images produced from it.
    for target in ("validator", "faucet", "social-bootstrap", "protocol-bootstrap", "tools", "explorer-api", "explorer-ui"):
        require(
            re.search(rf"^FROM .* AS {re.escape(target)}$", dockerfile, re.MULTILINE) is not None,
            f"Dockerfile target missing: {target}",
        )

    # Portable topology remains convenient for local use but still batteries-includes SocialFi.
    # The non-voting RPC replica stays an opt-in local experiment/profile, not a public startup gate.
    for service in ("faucet", "validator", "rpc-node", "social-bootstrap", "protocol-bootstrap", "explorer-api", "explorer-ui"):
        require(re.search(rf"^  {re.escape(service)}:\s*$", portable, re.MULTILINE) is not None, f"portable compose missing {service}")
    require('profiles: ["rpc"]' in portable, "portable rpc-node must remain optional")
    require("condition: service_completed_successfully" in portable, "portable Explorer must wait for SocialFi bootstrap")
    require("AEKO_SOCIAL_REGISTRY_FILE: /state/social-registry.env" in portable, "portable Explorer must consume generated SocialFi registry")

    # Validator image runtime must fail closed on key material and on a missing
    # established ledger. This prevents a changed Compose project/volume mount
    # from silently creating a replacement genesis.
    require(
        'REQUIRE_EXISTING_LEDGER=${AEKO_REQUIRE_EXISTING_LEDGER:-0}' in validator_entrypoint,
        "validator entrypoint must expose the existing-ledger continuity guard",
    )
    require(
        'expected an existing AEKO ledger' in validator_entrypoint
        and 'refusing to create a replacement genesis' in validator_entrypoint,
        "validator entrypoint must fail closed instead of recreating an established chain",
    )
    for label, compose in (("Dokploy", dokploy), ("Coolify", coolify)):
        require(
            "AEKO_REQUIRE_EXISTING_LEDGER: ${AEKO_REQUIRE_EXISTING_LEDGER:-1}" in compose,
            f"{label} must require the established validator ledger by default",
        )
        require(
            re.search(r"^  protocol-state:\s*$", compose, re.MULTILINE) is not None,
            f"{label} must declare the protocol-state volume it mounts",
        )
    require(
        "AEKO_REQUIRE_EXISTING_LEDGER: ${AEKO_REQUIRE_EXISTING_LEDGER:-0}" in portable,
        "portable/local compose must keep intentional first genesis available by default",
    )
    require(
        re.search(r"^  protocol-state:\s*$", portable, re.MULTILINE) is not None,
        "portable/local compose must declare the protocol-state volume it mounts",
    )

    # Public key lifecycle must not silently replace established identities.
    require(
        "AEKO_ALLOW_CHAIN_KEY_GENERATION: ${AEKO_ALLOW_CHAIN_KEY_GENERATION:-0}" in coolify,
        "Coolify must require explicit opt-in before generating chain identity keys",
    )
    require(
        "refusing to generate a replacement chain identity" in coolify,
        "Coolify key bootstrap must fail closed on missing established chain keys",
    )
    for label, compose in (("Dokploy", dokploy), ("Coolify", coolify)):
        require(
            "AEKO_ALLOW_PROTOCOL_AUTHORITY_GENERATION: ${AEKO_ALLOW_PROTOCOL_AUTHORITY_GENERATION:-0}" in compose,
            f"{label} must require explicit opt-in before creating a protocol authority",
        )
        require(
            "protocol-registry.env" in compose
            and "refusing to replace an established protocol authority" in compose
            and "AEKO_ALLOW_PROTOCOL_AUTHORITY_GENERATION=1 only when intentionally creating the first protocol authority" in compose,
            f"{label} must preserve protocol-authority identity once protocol state exists",
        )
        require(
            "protocol-continuity:/protocol-continuity:ro" in compose
            and "/protocol-continuity/protocol-registry.anchor" in compose,
            f"{label} key bootstrap must consult the independent protocol continuity anchor",
        )
        require(
            "AEKO_PROTOCOL_AUTHORITY" in compose
            and "protocol authority key does not match established protocol identity" in compose,
            f"{label} key bootstrap must verify the protocol-authority pubkey against established state",
        )

    # Validator image runtime must fail closed on key material and support the
    # same-host transaction peer used by the public Dokploy topology.
    require(
        '[ ! -f "$path" ] || [ ! -s "$path" ]' in validator_entrypoint,
        "validator entrypoint must reject non-files as keypairs",
    )
    require(
        '--rpc-send-transaction-tpu-peer "$AEKO_RPC_SEND_TRANSACTION_TPU_PEER"' in validator_entrypoint,
        "validator entrypoint must support an explicit RPC transaction TPU peer",
    )
    for storage_flag in (
        '--maximum-full-snapshots-to-retain "$AEKO_MAX_FULL_SNAPSHOTS"',
        '--maximum-incremental-snapshots-to-retain "$AEKO_MAX_INCREMENTAL_SNAPSHOTS"',
        '--accounts-shrink-optimize-total-space "$AEKO_ACCOUNTS_SHRINK_OPTIMIZE_TOTAL_SPACE"',
        '--accounts-db-cache-limit-mb "$AEKO_ACCOUNTS_DB_CACHE_LIMIT_MB"',
        '--accounts-index-memory-limit-mb "$AEKO_ACCOUNTS_INDEX_MEMORY_LIMIT_MB"',
    ):
        require(storage_flag in validator_entrypoint, f"validator entrypoint missing storage tuning flag: {storage_flag}")
    require(
        "pub const DEFAULT_MIN_MAX_LEDGER_SHREDS: u64 = 5_000_000;" in blockstore_cleanup,
        "AEKO validator must permit the constrained Dokploy ledger retention floor",
    )

    # SocialFi bootstrap must distinguish an incomplete first boot from a
    # missing state on a previously completed chain. It must also own the
    # economic vault lifecycle so Social programs never need to debit arbitrary
    # system-owned user accounts directly.
    require(
        'parse_bool_flag("AEKO_BOOTSTRAP_ALLOW_MISSING_STATE")' in social_bootstrap,
        "SocialFi bootstrap must consume AEKO_BOOTSTRAP_ALLOW_MISSING_STATE",
    )
    require(
        "registry_preexisted && !allow_missing_state" in social_bootstrap,
        "SocialFi bootstrap must fail closed when completed registry state disappears",
    )
    require(
        "existing initialized state verified" in social_bootstrap,
        "SocialFi bootstrap must remain idempotent for already initialized state",
    )
    for vault_file in (
        "social-rewards-treasury.json",
        "social-rewards-vault.json",
        "social-staking-principal-vault.json",
        "social-staking-reward-vault.json",
        "social-monetization-treasury.json",
    ):
        require(vault_file in social_bootstrap, f"SocialFi bootstrap missing persisted program-owned vault: {vault_file}")
    require("ensure_program_vault" in social_bootstrap, "SocialFi bootstrap must verify/create program-owned economic vaults")
    require("account.owner != *owner" in social_bootstrap, "SocialFi bootstrap must reject vault owner mismatches")
    require("account.data.is_empty()" in social_bootstrap, "SocialFi economic vaults must remain zero-data custody accounts")
    for migration in ("update_vaults", "update_treasury"):
        require(migration in social_bootstrap, f"SocialFi bootstrap must migrate existing protocol state with {migration}")
    for seed_env in (
        "AEKO_REWARDS_TREASURY_SEED_LAMPORTS",
        "AEKO_REWARD_VAULT_SEED_LAMPORTS",
        "AEKO_STAKE_REWARD_VAULT_SEED_LAMPORTS",
    ):
        require(seed_env in social_bootstrap, f"SocialFi bootstrap must expose payout-liquidity seed {seed_env}")

    # Post-genesis native programs must be dormant on historical banks until
    # their explicit feature accounts become active.
    require(
        'declare_id!("Ca5Lhktqd4epk3DDqsp7azXAunK3KZ8ZxeykU81oUUHT")' in feature_set,
        "token-program feature id must match the offline activation authority",
    )
    require(
        'declare_id!("KBq8JBrCEbWJ6S2NXpcBvQDvt7J6hUZW3i61zzzZWxF")' in feature_set,
        "permission-layer feature id must match the offline activation authority",
    )
    require(
        builtins.count("feature_id: Some(feature_set::aeko_token_programs_v1::id())") == 5,
        "exactly five token native programs must share the token-program feature gate",
    )
    require(
        builtins.count("feature_id: Some(feature_set::aeko_permission_layer_v1::id())") == 6,
        "exactly six permission/security native programs must share the permission feature gate",
    )

    for required in (
        'parse_bool_flag_with_default("AEKO_PROTOCOL_BOOTSTRAP_ENABLED", false)',
        "require_feature_active",
        "require_executable_program",
        "registry_preexisted && !allow_missing_state",
        "protocol-registry.env",
        "AEKO_TOKENOMICS_PROGRAM_ID",
        "AEKO_FINALITY_ORACLE_PROGRAM_ID",
        "TokenomicsStateAccount::signed_off_defaults",
        "MintPolicy::PublicMintControlled",
        "initialize_multisig",
        "initialize_oracle",
    ):
        require(required in protocol_bootstrap, f"protocol bootstrap missing required contract: {required}")

    require("/registry/protocol" in protocol_smoke, "protocol smoke must verify Explorer protocol registry")
    require("/protocol/status" in protocol_smoke, "protocol smoke must verify live protocol status")
    require("getHealth" in protocol_smoke and "getSlot" in protocol_smoke, "protocol smoke must verify live chain health and advancement")
    require("smoke-aeko-protocol.py" in protocol_integration, "protocol integration must execute the read-only protocol smoke")
    require("AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE" in protocol_integration, "protocol integration must exercise explicit state-volume recovery")
    require("cmp" in protocol_integration and "protocol-registry.env" in protocol_integration, "protocol integration must prove idempotent canonical registry identity")
    require("getGenesisHash" in protocol_integration and "getTransaction" in protocol_integration, "protocol integration must prove ledger identity and historical transaction continuity across restart")
    require("unexpectedly accepted a missing established state volume" in protocol_integration, "protocol integration must prove missing protocol-state fails closed before recovery")
    require("aeko-keygen pubkey" in protocol_activate, "feature activation helper must verify offline keypair identities")
    require("Ca5Lhktqd4epk3DDqsp7azXAunK3KZ8ZxeykU81oUUHT" in protocol_activate, "activation helper must pin the token feature id")
    require("KBq8JBrCEbWJ6S2NXpcBvQDvt7J6hUZW3i61zzzZWxF" in protocol_activate, "activation helper must pin the permission feature id")

    # Dokploy is an image-pull deployment contract, never a second build system.
    require(re.search(r"^\s+build:\s*$", dokploy, re.MULTILINE) is None, "Dokploy compose must pull prebuilt images, not build source")
    require(
        re.search(r"^  rpc-node:\s*$", dokploy, re.MULTILINE) is None,
        "Dokploy must not make the non-voting RPC replica a mandatory/default service",
    )
    ordered = ["faucet", "validator", "social-bootstrap", "protocol-bootstrap", "explorer-api", "explorer-ui", "operations-web", "wallet-tools"]
    for index, service in enumerate(ordered):
        next_service = ordered[index + 1] if index + 1 < len(ordered) else None
        block = service_block(dokploy, service, next_service)
        require("image:" in block, f"Dokploy {service} must use a published image")
        require("pull_policy: always" in block, f"Dokploy {service} must pull the selected Docker Hub tag")

    validator = service_block(dokploy, "validator", "social-bootstrap")
    bootstrap = service_block(dokploy, "social-bootstrap", "protocol-bootstrap")
    protocol_bootstrap_service = service_block(dokploy, "protocol-bootstrap", "explorer-api")
    explorer = service_block(dokploy, "explorer-api", "explorer-ui")
    explorer_ui = service_block(dokploy, "explorer-ui", "operations-web")
    operations_web = service_block(dokploy, "operations-web", "wallet-tools")
    wallet_tools = service_block(dokploy, "wallet-tools")

    require("AEKO_NODE_ROLE: validator" in validator, "validator role must be explicit")
    require("AEKO_GOSSIP_HOST: ${AEKO_PUBLIC_IP:?" in validator, "public validator must advertise the Dokploy host")
    require("AEKO_DYNAMIC_PORT_RANGE: 8000-8050" in validator, "public validator transport range must be explicit")
    require('"8000-8050:8000-8050/tcp"' in validator, "validator TCP transport range must be published")
    require('"8000-8050:8000-8050/udp"' in validator, "validator UDP transport range must be published")
    validator_ports = validator.split("    ports:", 1)[1].split("    expose:", 1)[0]
    require(":8899" not in validator_ports and ":8900" not in validator_ports, "validator RPC/WS must be routed by Dokploy, not host-published directly")
    require('      - "8899"' in validator and '      - "8900"' in validator, "validator must expose RPC and PubSub to Dokploy/Traefik")
    require("AEKO_PUBLIC_RPC_ADDRESS" not in validator, "single-validator Dokploy must not advertise a Docker-private RPC address through gossip")
    require(
        "AEKO_RPC_SEND_TRANSACTION_TPU_PEER: ${AEKO_VALIDATOR_TPU_QUIC_PEER:-validator:8009}" in validator,
        "validator RPC must route submitted transactions over the internal QUIC TPU",
    )

    # A 45GB-class test server cannot reach the upstream 50m-shred cleanup
    # floor safely. Dokploy must therefore opt into AEKO's constrained profile,
    # while leaving the portable/high-capacity validator defaults unchanged.
    require("AEKO_LEDGER_LIMIT: ${AEKO_LEDGER_LIMIT:-8000000}" in validator, "Dokploy validator must use bounded low-storage ledger retention")
    require("AEKO_MAX_FULL_SNAPSHOTS: ${AEKO_MAX_FULL_SNAPSHOTS:-1}" in validator, "Dokploy validator must bound full snapshot retention")
    require("AEKO_MAX_INCREMENTAL_SNAPSHOTS: ${AEKO_MAX_INCREMENTAL_SNAPSHOTS:-1}" in validator, "Dokploy validator must bound incremental snapshot retention")
    require("AEKO_ACCOUNTS_SHRINK_OPTIMIZE_TOTAL_SPACE: ${AEKO_ACCOUNTS_SHRINK_OPTIMIZE_TOTAL_SPACE:-true}" in validator, "Dokploy validator must optimize AccountsDB for disk usage")
    require("AEKO_ACCOUNTS_DB_CACHE_LIMIT_MB: ${AEKO_ACCOUNTS_DB_CACHE_LIMIT_MB:-512}" in validator, "Dokploy validator must bound AccountsDB write cache memory")
    require("AEKO_ACCOUNTS_INDEX_MEMORY_LIMIT_MB: ${AEKO_ACCOUNTS_INDEX_MEMORY_LIMIT_MB:-512}" in validator, "Dokploy validator must bound accounts-index memory")
    require("AEKO_MIN_FREE_DISK_KB: ${AEKO_MIN_FREE_DISK_KB:-2097152}" in validator, "Dokploy validator must expose a low-disk health threshold")
    require("df -Pk /ledger" in validator, "validator healthcheck must reject critically low ledger disk space")
    require("${AEKO_VALIDATOR_LEDGER_VOLUME:-validator-ledger}:/ledger" in validator, "validator ledger must support a separately mounted block volume")
    require("x-logging: &default-logging" in dokploy and "max-size: ${AEKO_LOG_MAX_SIZE:-10m}" in dokploy, "Dokploy must rotate container logs instead of allowing unbounded json-file growth")

    require("AEKO_BOOTSTRAP_ALLOW_MISSING_STATE: ${AEKO_BOOTSTRAP_ALLOW_MISSING_STATE:-0}" in bootstrap, "SocialFi reset recovery must be an explicit opt-in")
    require("social-state:/state" in bootstrap, "SocialFi state/registry must persist")
    require(
        "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in bootstrap,
        "SocialFi bootstrap must use an env-overridable internal RPC with validator:8899 as the Docker-network default",
    )
    require('restart: "no"' in bootstrap, "SocialFi bootstrap must fail once instead of entering an outer Docker restart storm")
    for seed_env in (
        "AEKO_REWARDS_TREASURY_SEED_LAMPORTS",
        "AEKO_REWARD_VAULT_SEED_LAMPORTS",
        "AEKO_STAKE_REWARD_VAULT_SEED_LAMPORTS",
    ):
        require(f"{seed_env}: ${{{seed_env}:-0}}" in bootstrap, f"Dokploy bootstrap must expose {seed_env} with a safe zero default")
    for obsolete_override in ("AEKO_REWARD_VAULT:", "AEKO_STAKE_VAULT:"):
        require(obsolete_override not in bootstrap, f"Dokploy bootstrap must not configure obsolete operator-owned vault address {obsolete_override}")

    require("AEKO_PROTOCOL_BOOTSTRAP_ENABLED: ${AEKO_PROTOCOL_BOOTSTRAP_ENABLED:-0}" in protocol_bootstrap_service, "Dokploy protocol bootstrap must default disabled during runtime upgrade")
    require("protocol-authority-keypair.json" in protocol_bootstrap_service, "Dokploy protocol bootstrap must use a dedicated protocol authority")
    require("protocol-state:/state" in protocol_bootstrap_service, "Dokploy protocol state must persist")
    require("protocol-continuity:/continuity" in protocol_bootstrap_service, "Dokploy protocol continuity anchor must persist separately")
    require("AEKO_REQUIRE_EXISTING_PROTOCOL_STATE: ${AEKO_REQUIRE_EXISTING_PROTOCOL_STATE:-1}" in protocol_bootstrap_service, "Dokploy protocol bootstrap must fail closed when established protocol state disappears")
    require("AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION: ${AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION:-0}" in protocol_bootstrap_service, "Dokploy first protocol-state initialization must be explicit")
    require('restart: "no"' in protocol_bootstrap_service, "Dokploy protocol bootstrap must be a one-shot service")
    require("AEKO_PROTOCOL_REGISTRY_FILE: /protocol-state/protocol-registry.env" in explorer, "Dokploy Explorer must consume protocol registry")
    require("protocol-state:/protocol-state:ro" in explorer, "Dokploy Explorer must mount protocol state read-only")
    require("depends_on:" not in operations_web, "Dokploy Operations Web lifecycle must be independent of validator health")

    require(
        "AEKO_EXPLORER_RPC: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in explorer,
        "public Explorer must use the env-overridable internal validator RPC instead of a public hostname",
    )
    require(
        "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in operations_web,
        "Dokploy operations web must talk to the validator through the internal Docker-network RPC",
    )
    require(
        "AEKO_EXPLORER_URL: ${AEKO_INTERNAL_EXPLORER_API_URL:-http://explorer-api:8088}" in operations_web,
        "Dokploy operations web must talk to Explorer through the internal Docker-network API",
    )
    require("EXPLORER_DATABASE_URL:?" in explorer, "public Explorer must require durable PostgreSQL")
    require("AEKO_SOCIAL_REGISTRY_FILE: /state/social-registry.env" in explorer, "Explorer must consume generated SocialFi registry")
    for registry_key in (
        "AEKO_REWARDS_TREASURY_ACCOUNT",
        "AEKO_REWARD_VAULT_ACCOUNT",
        "AEKO_STAKE_VAULT_ACCOUNT",
        "AEKO_STAKE_REWARD_VAULT_ACCOUNT",
        "AEKO_TREASURY_ADDRESS",
    ):
        require(registry_key in explorer, f"Explorer explicit registry overrides must include {registry_key}")
    require("validator:" in explorer and "condition: service_healthy" in explorer, "Explorer must wait for validator health")
    require("condition: service_completed_successfully" not in explorer, "Explorer process startup must not be blocked by a failed one-shot SocialFi bootstrap")
    require("http://127.0.0.1:8088/" in explorer, "Explorer container health must use process liveness")
    require("http://127.0.0.1:8088/health" not in explorer, "Explorer container health must not couple process liveness to strict readiness")
    require("repository.ping().await" in explorer_health, "Explorer readiness must prove PostgreSQL availability")
    require("rpc.health()?" in explorer_health and "rpc.latest_slot()" in explorer_health, "Explorer readiness must prove validator RPC health and slot availability")
    require("latest_indexed_slot().await" in explorer_health, "Explorer readiness must inspect the durable indexer cursor")
    require("StatusCode::SERVICE_UNAVAILABLE" in explorer_health, "Explorer readiness must fail closed when dependencies or cursor lag are unhealthy")
    require('"complete":true' not in explorer, "Explorer core health must not be coupled to SocialFi completeness")
    require("explorer-api:" not in explorer_ui, "Dokploy Explorer UI startup must not depend on Explorer API health")
    require("http://explorer-api:8088" not in explorer_ui, "Dokploy Explorer UI healthcheck must not probe Explorer API")
    require("http://127.0.0.1:4000/" in explorer_ui, "Dokploy Explorer UI healthcheck must prove only the UI server is serving")
    require('"complete":true' not in explorer_ui, "Explorer UI liveness must not be coupled to SocialFi completeness")
    require('profiles: ["ops"]' in wallet_tools, "wallet tools must be operator-only, not a public daemon")
    require(re.search(r"^  postgres(?:ql)?:", dokploy, re.MULTILINE) is None, "Dokploy compose must not embed PostgreSQL")
    require("rpc-node-keypair.json" not in dokploy, "default Dokploy topology must not require an unused RPC-replica identity")
    require("rpc-ledger:" not in dokploy, "default Dokploy topology must not retain an unused RPC-replica ledger volume")

    # Coolify mirrors the image-only public topology. Keep storage syntax
    # deliberately conservative because Coolify validates volume sources before
    # the containers are created.
    require(re.search(r"^\s+build:\s*$", coolify, re.MULTILINE) is None, "Coolify compose must pull prebuilt images, not build source")
    require(re.search(r"^  rpc-node:\s*$", coolify, re.MULTILINE) is None, "Coolify must not make the optional RPC replica a default service")
    for index, service in enumerate(ordered):
        next_service = ordered[index + 1] if index + 1 < len(ordered) else None
        block = service_block(coolify, service, next_service)
        require("image:" in block, f"Coolify {service} must use a published image")
        require("pull_policy: always" in block, f"Coolify {service} must pull the selected Docker Hub tag")

    coolify_key_bootstrap = service_block(coolify, "key-bootstrap", "faucet")
    coolify_faucet = service_block(coolify, "faucet", "validator")
    coolify_validator = service_block(coolify, "validator", "social-bootstrap")
    coolify_bootstrap = service_block(coolify, "social-bootstrap", "protocol-bootstrap")
    coolify_protocol_bootstrap = service_block(coolify, "protocol-bootstrap", "explorer-api")
    coolify_explorer = service_block(coolify, "explorer-api", "explorer-ui")
    coolify_operations_web = service_block(coolify, "operations-web", "wallet-tools")
    coolify_wallet_tools = service_block(coolify, "wallet-tools")
    # The operations web app owns public Funding Gateway policy plus the operator
    # console. The private Faucet Daemon is a separate TCP service.
    require("ADMIN_PASSWORD: ${ADMIN_PASSWORD:?}" in coolify_operations_web, "Coolify operations web must require an operator password")
    require("ADMIN_SESSION_SECRET: ${ADMIN_SESSION_SECRET:?}" in coolify_operations_web, "Coolify operations web must require a session secret")
    require("- admin-state:/data" in coolify_operations_web, "Coolify operations web must persist funding policy/grants in the admin-state volume")
    require("http://127.0.0.1:3001/api/funding/policy" in coolify_operations_web, "Coolify operations web healthcheck must probe the public funding policy endpoint")
    require("--per-request-cap" in coolify_faucet, "Coolify faucet must enforce a per-request airdrop ceiling")
    require("AEKO_KEYS_DIR" not in coolify, "Coolify compose must not depend on interpolated key-path variables")
    require("source: ${" not in coolify, "Coolify volume sources must not contain Compose interpolation")
    require(coolify.count("source: /data/aeko/keys") >= 5, "Coolify runtime and key bootstrap services must share the fixed host key bind source")
    require(coolify.count("read_only: true") >= 3, "Coolify long-running runtime key mounts must remain read-only")
    require(re.search(r"^  key-preflight:\\s*$", coolify, re.MULTILINE) is None, "Coolify must not use the diagnostic preflight as a global startup gate")
    require('entrypoint: ["/bin/sh", "-ec"]' in coolify_key_bootstrap, "Coolify key bootstrap must run an explicit one-shot shell")
    require('aeko-keygen new --no-bip39-passphrase --silent --outfile "$$path"' in coolify_key_bootstrap, "Coolify key bootstrap must create missing persistent keypairs")
    require('path="/keys/$${key}.json"' in coolify_key_bootstrap, "Coolify key bootstrap path must survive Compose interpolation")
    require('if [ ! -s "$$path" ]; then' in coolify_key_bootstrap, "Coolify key bootstrap must preserve existing non-empty keypairs")
    require('aeko-keygen pubkey "$$path" >/dev/null' in coolify_key_bootstrap, "Coolify key bootstrap must validate every resulting keypair")
    require(
        re.search(r'(?<!\$)\$(?:\{(?:key|path)\}|(?:key|path)\b)', coolify_key_bootstrap) is None,
        "Coolify key bootstrap shell variables must be escaped from Compose interpolation",
    )
    require('restart: "no"' in coolify_key_bootstrap, "Coolify key bootstrap must be a one-shot initializer")
    require("key-bootstrap:" in coolify_faucet and "condition: service_completed_successfully" in coolify_faucet, "Coolify faucet must wait for persistent key initialization")
    require('restart: "no"' in coolify_bootstrap, "Coolify SocialFi bootstrap must remain a one-shot initializer")
    require("AEKO_PROTOCOL_BOOTSTRAP_ENABLED: ${AEKO_PROTOCOL_BOOTSTRAP_ENABLED:-0}" in coolify_protocol_bootstrap, "Coolify protocol bootstrap must default disabled during runtime upgrade")
    require("protocol-authority-keypair.json" in coolify_protocol_bootstrap, "Coolify protocol bootstrap must use dedicated authority")
    require("protocol-state:/state" in coolify_protocol_bootstrap, "Coolify protocol state must persist")
    require("protocol-continuity:/continuity" in coolify_protocol_bootstrap, "Coolify protocol continuity anchor must persist separately")
    require("AEKO_REQUIRE_EXISTING_PROTOCOL_STATE: ${AEKO_REQUIRE_EXISTING_PROTOCOL_STATE:-1}" in coolify_protocol_bootstrap, "Coolify protocol bootstrap must fail closed when established protocol state disappears")
    require("AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION: ${AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION:-0}" in coolify_protocol_bootstrap, "Coolify first protocol-state initialization must be explicit")
    require("AEKO_PROTOCOL_REGISTRY_FILE: /protocol-state/protocol-registry.env" in coolify_explorer, "Coolify Explorer must consume protocol registry")
    require("protocol-state:/protocol-state:ro" in coolify_explorer, "Coolify Explorer must mount protocol state read-only")
    require("depends_on:" not in coolify_operations_web, "Coolify Operations Web lifecycle must be independent of validator health")
    require('profiles: ["ops"]' in coolify_wallet_tools, "Coolify wallet tools must remain operator-only and absent from default startup")
    require("exit 64" in key_preflight and "exit 65" in key_preflight, "reusable key preflight helper must preserve distinct missing/invalid key exit codes")
    require("validator-ledger:/ledger" in coolify_validator, "Coolify validator must use a Docker-managed ledger volume by default")
    require("AEKO_VALIDATOR_LEDGER_VOLUME" not in coolify, "Coolify ledger source must not use interpolated volume-source syntax")
    require("AEKO_GOSSIP_HOST: ${AEKO_PUBLIC_IP:?}" in coolify_validator, "Coolify must require the public validator address")
    require("AEKO_FUNDING_GATEWAY_KEY: ${FUNDING_GATEWAY_KEY:?}" in coolify_validator, "Coolify validator must protect requestAirdrop behind the Funding Gateway key")
    require("FUNDING_GATEWAY_KEY: ${FUNDING_GATEWAY_KEY:?}" in coolify_operations_web, "Coolify admin must receive the matching Funding Gateway key")
    require('"8000-8050:8000-8050/tcp"' in coolify_validator, "Coolify validator TCP transport range must be published")
    require('"8000-8050:8000-8050/udp"' in coolify_validator, "Coolify validator UDP transport range must be published")
    require(
        "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in coolify_bootstrap,
        "Coolify bootstrap must use an env-overridable internal validator RPC",
    )
    require(
        "AEKO_EXPLORER_RPC: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in coolify_explorer,
        "Coolify Explorer must use the internal validator RPC instead of a public hostname",
    )
    require(
        "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in coolify_operations_web,
        "Coolify operations web must use the internal validator RPC",
    )
    require(
        "AEKO_EXPLORER_URL: ${AEKO_INTERNAL_EXPLORER_API_URL:-http://explorer-api:8088}" in coolify_operations_web,
        "Coolify operations web must use the internal Explorer API",
    )
    require("DATABASE_URL: ${EXPLORER_DATABASE_URL:?}" in coolify_explorer, "Coolify Explorer must require durable PostgreSQL")
    require('profiles: ["ops"]' in coolify_wallet_tools, "Coolify wallet tools must remain operator-only")
    require(re.search(r"^  postgres(?:ql)?:", coolify, re.MULTILINE) is None, "Coolify compose must not embed PostgreSQL")

    # Portable compose must expose the same Social vault lifecycle so local
    # validation and Dokploy do not exercise different custody models.
    portable_bootstrap = service_block(portable, "social-bootstrap", "protocol-bootstrap")
    portable_protocol_bootstrap = service_block(portable, "protocol-bootstrap", "explorer-api")
    portable_explorer = service_block(portable, "explorer-api", "explorer-ui")
    portable_operations_web = service_block(portable, "operations-web")
    require("AEKO_BOOTSTRAP_ALLOW_MISSING_STATE: ${AEKO_BOOTSTRAP_ALLOW_MISSING_STATE:-0}" in portable_bootstrap, "portable bootstrap must expose explicit recovery")
    require(
        "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in portable_bootstrap,
        "portable bootstrap must use the internal validator RPC by default",
    )
    require(
        "AEKO_EXPLORER_RPC: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in portable_explorer,
        "portable Explorer must use the internal validator RPC by default",
    )
    require(
        "AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in portable_operations_web,
        "portable operations web must use the internal validator RPC",
    )
    require(
        "AEKO_EXPLORER_URL: ${AEKO_INTERNAL_EXPLORER_API_URL:-http://explorer-api:8088}" in portable_operations_web,
        "portable operations web must use the internal Explorer API",
    )
    require("AEKO_PROTOCOL_BOOTSTRAP_ENABLED: ${AEKO_PROTOCOL_BOOTSTRAP_ENABLED:-0}" in portable_protocol_bootstrap, "portable protocol bootstrap must default disabled")
    require("protocol-authority-keypair.json" in portable_protocol_bootstrap, "portable protocol bootstrap must use dedicated authority")
    require("protocol-continuity:/continuity" in portable_protocol_bootstrap, "portable protocol continuity anchor must persist separately")
    require("AEKO_PROTOCOL_REGISTRY_FILE: /protocol-state/protocol-registry.env" in portable_explorer, "portable Explorer must consume protocol registry")
    require("protocol-state:/protocol-state:ro" in portable_explorer, "portable Explorer must mount protocol state read-only")
    require("depends_on:" not in portable_operations_web, "portable Operations Web lifecycle must be independent of validator health")
    require("AEKO_EXPLORER_NETWORK: ${AEKO_EXPLORER_NETWORK:-localnet}" in portable_explorer, "portable Explorer must default to localnet identity rather than production testnet")
    require("http://127.0.0.1:8088/" in portable_explorer, "portable Explorer container health must use process liveness")
    require("http://127.0.0.1:8088/health" not in portable_explorer, "portable Explorer container health must not couple process liveness to readiness")
    for seed_env in (
        "AEKO_REWARDS_TREASURY_SEED_LAMPORTS",
        "AEKO_REWARD_VAULT_SEED_LAMPORTS",
        "AEKO_STAKE_REWARD_VAULT_SEED_LAMPORTS",
    ):
        require(f"{seed_env}: ${{{seed_env}:-0}}" in portable_bootstrap, f"portable bootstrap must expose {seed_env}")
    for registry_key in (
        "AEKO_REWARDS_TREASURY_ACCOUNT",
        "AEKO_REWARD_VAULT_ACCOUNT",
        "AEKO_STAKE_VAULT_ACCOUNT",
        "AEKO_STAKE_REWARD_VAULT_ACCOUNT",
        "AEKO_TREASURY_ADDRESS",
    ):
        require(registry_key in portable_explorer, f"portable Explorer explicit overrides must include {registry_key}")

    # Public endpoint and operator mental model must remain canonical.
    for endpoint in (
        "https://rpc.aeko.online",
        "wss://ws.aeko.online",
        "https://api.aeko.online",
        "https://scan.aeko.online",
        "gossip.aeko.online:8001",
    ):
        require(endpoint in readme, f"README missing public endpoint {endpoint}")
    require("docker/compose.dokploy.yml" in readme, "README must document the Dokploy deployment contract")
    require("docker/compose.coolify.yml" in readme, "README must document the Coolify deployment contract")
    require("/registry/social" in readme and "complete" in readme, "README must document SocialFi registry acceptance")
    require("wallet" in readme.lower() and "not a" in readme.lower(), "README must explain wallet/client versus daemon responsibilities")
    require("protocol-maturity" in readme.lower() or "protocol maturity" in readme.lower(), "README must disclose remaining SocialFi protocol maturity boundaries")

    require("rpc.aeko.online` | `validator` | `8899" in deployment, "deployment guide must route public RPC to validator")
    require("ws.aeko.online` | `validator` | `8900" in deployment, "deployment guide must route public WebSocket to validator")
    require("public/Dokploy stack; uses prebuilt Docker Hub images and serves RPC/WS from the healthy voting validator" in deployment, "deployment guide must describe the single-validator Dokploy RPC topology")
    require("Explorer API/UI remain available in a degraded state" in deployment, "deployment guide must document degraded Explorer behavior when SocialFi bootstrap fails")
    require("docker/compose.coolify.yml" in deployment, "deployment guide must document the Coolify Compose path")

    print("[PASS] AEKO local + Dokploy + Coolify deployment contracts are internally consistent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
