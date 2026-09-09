#!/usr/bin/env python3
"""Static acceptance checks for AEKO's portable and Dokploy deployment contracts."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTABLE = ROOT / "docker-compose.yml"
DOKPLOY = ROOT / "docker-compose.dokploy.yml"
DOCKERFILE = ROOT / "Dockerfile"
VALIDATOR_ENTRYPOINT = ROOT / "docker" / "validator-entrypoint.sh"
BLOCKSTORE_CLEANUP = ROOT / "ledger" / "src" / "blockstore_cleanup_service.rs"
SOCIAL_BOOTSTRAP = ROOT / "social-bootstrap" / "src" / "main.rs"
EXPLORER_HEALTH = ROOT / "apps" / "explorer" / "backend" / "src" / "features" / "health" / "mod.rs"
README = ROOT / "README.md"
DEPLOYMENT = ROOT / "DEPLOYMENT.md"


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
    dockerfile = read(DOCKERFILE)
    validator_entrypoint = read(VALIDATOR_ENTRYPOINT)
    blockstore_cleanup = read(BLOCKSTORE_CLEANUP)
    social_bootstrap = read(SOCIAL_BOOTSTRAP)
    explorer_health = read(EXPLORER_HEALTH)
    readme = read(README)
    deployment = read(DEPLOYMENT)

    # One canonical build recipe, with all role-specific images produced from it.
    for target in ("validator", "faucet", "social-bootstrap", "tools", "explorer-api", "explorer-ui"):
        require(
            re.search(rf"^FROM .* AS {re.escape(target)}$", dockerfile, re.MULTILINE) is not None,
            f"Dockerfile target missing: {target}",
        )

    # Portable topology remains convenient for local use but still batteries-includes SocialFi.
    # The non-voting RPC replica stays an opt-in local experiment/profile, not a public startup gate.
    for service in ("faucet", "validator", "rpc-node", "social-bootstrap", "explorer-api", "explorer-ui"):
        require(re.search(rf"^  {re.escape(service)}:\s*$", portable, re.MULTILINE) is not None, f"portable compose missing {service}")
    require('profiles: ["rpc"]' in portable, "portable rpc-node must remain optional")
    require("condition: service_completed_successfully" in portable, "portable Explorer must wait for SocialFi bootstrap")
    require("AEKO_SOCIAL_REGISTRY_FILE: /state/social-registry.env" in portable, "portable Explorer must consume generated SocialFi registry")

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

    # Dokploy is an image-pull deployment contract, never a second build system.
    require(re.search(r"^\s+build:\s*$", dokploy, re.MULTILINE) is None, "Dokploy compose must pull prebuilt images, not build source")
    require(
        re.search(r"^  rpc-node:\s*$", dokploy, re.MULTILINE) is None,
        "Dokploy must not make the non-voting RPC replica a mandatory/default service",
    )
    ordered = ["faucet", "validator", "social-bootstrap", "explorer-api", "explorer-ui", "wallet-tools"]
    for index, service in enumerate(ordered):
        next_service = ordered[index + 1] if index + 1 < len(ordered) else None
        block = service_block(dokploy, service, next_service)
        require("image:" in block, f"Dokploy {service} must use a published image")
        require("pull_policy: always" in block, f"Dokploy {service} must pull the selected Docker Hub tag")

    validator = service_block(dokploy, "validator", "social-bootstrap")
    bootstrap = service_block(dokploy, "social-bootstrap", "explorer-api")
    explorer = service_block(dokploy, "explorer-api", "explorer-ui")
    explorer_ui = service_block(dokploy, "explorer-ui", "wallet-tools")
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
    require("AEKO_RPC_URL: http://validator:8899" in bootstrap, "SocialFi bootstrap must use the healthy validator RPC")
    require('restart: "no"' in bootstrap, "SocialFi bootstrap must fail once instead of entering an outer Docker restart storm")
    for seed_env in (
        "AEKO_REWARDS_TREASURY_SEED_LAMPORTS",
        "AEKO_REWARD_VAULT_SEED_LAMPORTS",
        "AEKO_STAKE_REWARD_VAULT_SEED_LAMPORTS",
    ):
        require(f"{seed_env}: ${{{seed_env}:-0}}" in bootstrap, f"Dokploy bootstrap must expose {seed_env} with a safe zero default")
    for obsolete_override in ("AEKO_REWARD_VAULT:", "AEKO_STAKE_VAULT:"):
        require(obsolete_override not in bootstrap, f"Dokploy bootstrap must not configure obsolete operator-owned vault address {obsolete_override}")

    require("AEKO_EXPLORER_RPC: http://validator:8899" in explorer, "public Explorer must index directly through the healthy validator RPC")
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

    # Portable compose must expose the same Social vault lifecycle so local
    # validation and Dokploy do not exercise different custody models.
    portable_bootstrap = service_block(portable, "social-bootstrap", "explorer-api")
    portable_explorer = service_block(portable, "explorer-api", "explorer-ui")
    require("AEKO_BOOTSTRAP_ALLOW_MISSING_STATE: ${AEKO_BOOTSTRAP_ALLOW_MISSING_STATE:-0}" in portable_bootstrap, "portable bootstrap must expose explicit recovery")
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
    require("docker-compose.dokploy.yml" in readme, "README must document the Dokploy deployment contract")
    require("/registry/social" in readme and "complete" in readme, "README must document SocialFi registry acceptance")
    require("wallet" in readme.lower() and "not a" in readme.lower(), "README must explain wallet/client versus daemon responsibilities")
    require("protocol-maturity" in readme.lower() or "protocol maturity" in readme.lower(), "README must disclose remaining SocialFi protocol maturity boundaries")

    require("rpc.aeko.online` | `validator` | `8899" in deployment, "deployment guide must route public RPC to validator")
    require("ws.aeko.online` | `validator` | `8900" in deployment, "deployment guide must route public WebSocket to validator")
    require("public/Dokploy stack; uses prebuilt Docker Hub images and serves RPC/WS from the healthy voting validator" in deployment, "deployment guide must describe the single-validator Dokploy RPC topology")
    require("Explorer API/UI remain available in a degraded state" in deployment, "deployment guide must document degraded Explorer behavior when SocialFi bootstrap fails")

    print("[PASS] AEKO portable + Dokploy deployment contracts are internally consistent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
