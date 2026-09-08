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
SOCIAL_BOOTSTRAP = ROOT / "social-bootstrap" / "src" / "main.rs"
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
    social_bootstrap = read(SOCIAL_BOOTSTRAP)
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

    # SocialFi bootstrap must distinguish an incomplete first boot from a
    # missing state on a previously completed chain. The former may safely
    # retry the persisted key; the latter is explicit recovery only.
    require(
        'parse_bool_flag("AEKO_BOOTSTRAP_ALLOW_MISSING_STATE")' in social_bootstrap,
        "SocialFi bootstrap must consume AEKO_BOOTSTRAP_ALLOW_MISSING_STATE",
    )
    require(
        "registry_preexisted && !allow_missing_state" in social_bootstrap,
        "SocialFi bootstrap must fail closed when completed registry state disappears",
    )
    require(
        "existing initialized state verified; skipping initialization" in social_bootstrap,
        "SocialFi bootstrap must remain idempotent for already initialized state",
    )

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

    require("AEKO_BOOTSTRAP_ALLOW_MISSING_STATE: ${AEKO_BOOTSTRAP_ALLOW_MISSING_STATE:-0}" in bootstrap, "SocialFi reset recovery must be an explicit opt-in")
    require("social-state:/state" in bootstrap, "SocialFi state/registry must persist")
    require("AEKO_RPC_URL: http://validator:8899" in bootstrap, "SocialFi bootstrap must use the healthy validator RPC")
    require('restart: "no"' in bootstrap, "SocialFi bootstrap must fail once instead of entering an outer Docker restart storm")

    require("AEKO_EXPLORER_RPC: http://validator:8899" in explorer, "public Explorer must index directly through the healthy validator RPC")
    require("EXPLORER_DATABASE_URL:?" in explorer, "public Explorer must require durable PostgreSQL")
    require("AEKO_SOCIAL_REGISTRY_FILE: /state/social-registry.env" in explorer, "Explorer must consume generated SocialFi registry")
    require("validator:" in explorer and "condition: service_healthy" in explorer, "Explorer must wait for validator health")
    require("condition: service_completed_successfully" not in explorer, "Explorer process startup must not be blocked by a failed one-shot SocialFi bootstrap")
    require("/blocks?limit=1" in explorer, "Explorer readiness must exercise its configured read store")
    require("http://validator:8899" in explorer and "getHealth" in explorer, "Explorer readiness must prove validator RPC availability")
    require('"complete":true' not in explorer, "Explorer core health must not be coupled to SocialFi completeness")
    require("/blocks?limit=1" in explorer_ui, "Explorer UI health must fail when the Explorer read path is unavailable")
    require('"complete":true' not in explorer_ui, "Explorer UI liveness must not be coupled to SocialFi completeness")
    require('profiles: ["ops"]' in wallet_tools, "wallet tools must be operator-only, not a public daemon")
    require(re.search(r"^  postgres(?:ql)?:", dokploy, re.MULTILINE) is None, "Dokploy compose must not embed PostgreSQL")
    require("rpc-node-keypair.json" not in dokploy, "default Dokploy topology must not require an unused RPC-replica identity")
    require("rpc-ledger:" not in dokploy, "default Dokploy topology must not retain an unused RPC-replica ledger volume")

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
