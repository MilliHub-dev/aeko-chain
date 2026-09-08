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
README = ROOT / "README.md"


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
    readme = read(README)

    # One canonical build recipe, with all role-specific images produced from it.
    for target in ("validator", "faucet", "social-bootstrap", "tools", "explorer-api", "explorer-ui"):
        require(
            re.search(rf"^FROM .* AS {re.escape(target)}$", dockerfile, re.MULTILINE) is not None,
            f"Dockerfile target missing: {target}",
        )

    # Portable topology remains convenient for local use but still batteries-includes SocialFi.
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

    # Dokploy is an image-pull deployment contract, never a second build system.
    require(re.search(r"^\s+build:\s*$", dokploy, re.MULTILINE) is None, "Dokploy compose must pull prebuilt images, not build source")
    ordered = ["faucet", "validator", "rpc-node", "social-bootstrap", "explorer-api", "explorer-ui", "wallet-tools"]
    for index, service in enumerate(ordered):
        next_service = ordered[index + 1] if index + 1 < len(ordered) else None
        block = service_block(dokploy, service, next_service)
        require("image:" in block, f"Dokploy {service} must use a published image")
        require("pull_policy: always" in block, f"Dokploy {service} must pull the selected Docker Hub tag")

    validator = service_block(dokploy, "validator", "rpc-node")
    rpc_node = service_block(dokploy, "rpc-node", "social-bootstrap")
    bootstrap = service_block(dokploy, "social-bootstrap", "explorer-api")
    explorer = service_block(dokploy, "explorer-api", "explorer-ui")
    wallet_tools = service_block(dokploy, "wallet-tools")

    require("AEKO_NODE_ROLE: validator" in validator, "validator role must be explicit")
    require("AEKO_GOSSIP_HOST: ${AEKO_PUBLIC_IP:?" in validator, "public validator must advertise the Dokploy host")
    require("AEKO_DYNAMIC_PORT_RANGE: 8000-8050" in validator, "public validator transport range must be explicit")
    require('"8000-8050:8000-8050/tcp"' in validator, "validator TCP transport range must be published")
    require('"8000-8050:8000-8050/udp"' in validator, "validator UDP transport range must be published")
    validator_ports = validator.split("    ports:", 1)[1].split("    expose:", 1)[0]
    require(":8899" not in validator_ports and ":8900" not in validator_ports, "voting validator RPC/WS must not be host-published in Dokploy")
    require(
        "AEKO_PUBLIC_RPC_ADDRESS: ${AEKO_VALIDATOR_BOOTSTRAP_RPC_ADDRESS:-validator:8899}" in validator,
        "voting validator must advertise a Docker-reachable RPC for same-host replica bootstrap",
    )
    require(
        "AEKO_RPC_SEND_TRANSACTION_TPU_PEER: ${AEKO_VALIDATOR_TPU_QUIC_PEER:-validator:8009}" in validator,
        "voting validator RPC must route submitted transactions over the internal QUIC TPU",
    )

    require("AEKO_NODE_ROLE: rpc" in rpc_node, "public RPC replica must use rpc role")
    require("profiles:" not in rpc_node, "public Dokploy rpc-node must start by default")
    require("AEKO_ENTRYPOINT: validator:8001" in rpc_node, "public RPC replica must join validator gossip")
    require("AEKO_DYNAMIC_PORT_RANGE: 8051-8101" in rpc_node, "RPC replica must have a non-overlapping transport range")
    require("AEKO_RESET_LEDGER: ${AEKO_RESET_LEDGER:-0}" in rpc_node, "RPC ledger reset must track an intentional validator reset")
    require('      - "8899"' in rpc_node and '      - "8900"' in rpc_node, "rpc-node must expose RPC and PubSub ports")
    require(
        "AEKO_RPC_SEND_TRANSACTION_TPU_PEER: ${AEKO_VALIDATOR_TPU_QUIC_PEER:-validator:8009}" in rpc_node,
        "public RPC replica must forward submitted transactions over the internal validator QUIC TPU",
    )

    require("AEKO_BOOTSTRAP_ALLOW_MISSING_STATE: ${AEKO_BOOTSTRAP_ALLOW_MISSING_STATE:-0}" in bootstrap, "SocialFi reset recovery must be an explicit opt-in")
    require("social-state:/state" in bootstrap, "SocialFi state/registry must persist")

    require("AEKO_EXPLORER_RPC: http://rpc-node:8899" in explorer, "public Explorer must index through rpc-node")
    require("EXPLORER_DATABASE_URL:?" in explorer, "public Explorer must require durable PostgreSQL")
    require("AEKO_SOCIAL_REGISTRY_FILE: /state/social-registry.env" in explorer, "Explorer must consume generated SocialFi registry")
    require("condition: service_completed_successfully" in explorer, "Explorer must wait for SocialFi bootstrap")
    require('profiles: ["ops"]' in wallet_tools, "wallet tools must be operator-only, not a public daemon")
    require(re.search(r"^  postgres(?:ql)?:", dokploy, re.MULTILINE) is None, "Dokploy compose must not embed PostgreSQL")

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

    print("[PASS] AEKO portable + Dokploy deployment contracts are internally consistent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
