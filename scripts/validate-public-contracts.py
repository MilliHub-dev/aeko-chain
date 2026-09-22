#!/usr/bin/env python3
"""Guard AEKO's public network vocabulary and endpoint contract against drift."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ContractFailure(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractFailure(message)


def read(path: str) -> str:
    target = ROOT / path
    require(target.is_file(), f"missing required file: {path}")
    return target.read_text(encoding="utf-8")


def reject(text: str, needle: str, where: str) -> None:
    require(needle not in text, f"{where} still contains retired/ambiguous value: {needle}")


def main() -> int:
    admin_env = read("apps/admin/.env.local.example")
    public_env = read("docker/env.public.example")
    portable = read("docker/compose.local.yml")
    coolify = read("docker/compose.coolify.yml")
    dokploy = read("docker/compose.dokploy.yml")
    explorer_env = read("apps/explorer/web/.env.production")
    network_config = read("apps/explorer/web/src/utils/networkConfig.js")
    docs_text = read("apps/explorer/web/src/data/docs.json")
    readme = read("README.md")
    deployment = read("DEPLOYMENT.md")
    backend_guide = read("BACKEND-DEV-GUIDE.md")
    runbook = read("docs/operations/testnet-runbook.md")
    clap_v2 = read("clap-utils/src/input_validators.rs")
    clap_v3 = read("clap-v3-utils/src/input_validators.rs")
    cli_config = read("cli-config/src/config.rs")
    install_defaults = read("install/src/defaults.rs")
    network_environments = read("docs/aeko-chain/testnet-mainnet.md")
    validator_guide = read("docs/aeko-chain/validator-guide.md")
    install_command = read("install/src/command.rs")
    install_deploy = read("scripts/aeko-install-deploy.sh")

    docs = json.loads(docs_text)
    require(isinstance(docs.get("content"), dict), "Explorer docs.json must contain a content object")

    canonical = {
        "rpc": "https://rpc.aeko.online",
        "ws": "wss://ws.aeko.online",
        "explorer_api": "https://api.aeko.online",
        "explorer_ui": "https://scan.aeko.online",
        "funding": "https://fund.aeko.online",
    }
    for name, endpoint in canonical.items():
        require(endpoint in explorer_env, f"Explorer production env missing canonical {name}: {endpoint}")

    require("FUNDING_PUBLIC_HOST=fund.aeko.online" in admin_env, "admin env must name the public Funding Portal explicitly")
    require("FUNDING_CLIENT_API_KEY=" in admin_env, "admin env must use FUNDING_CLIENT_API_KEY")
    require("FUNDING_ALLOWED_ORIGINS=https://scan.aeko.online" in admin_env, "admin env must document browser funding origins")
    require("FUNDING_STATE_DIR=" in admin_env, "admin env must use FUNDING_STATE_DIR")
    require("FUNDING_GATEWAY_KEY=" in admin_env, "admin env must document Funding Gateway authorization")
    require("FUNDING_PUBLIC_HOST=fund.aeko.online" in public_env, "public deployment env must use fund.aeko.online")
    require("FUNDING_ALLOWED_ORIGINS=https://scan.aeko.online" in public_env, "public deployment env must define browser funding origins")

    for where, text in {
        "admin env": admin_env,
        "public env": public_env,
        "portable compose": portable,
        "Coolify compose": coolify,
        "Dokploy compose": dokploy,
    }.items():
        for legacy in (
            "FAUCET_PUBLIC_HOST",
            "FAUCET_API_KEY",
            "FAUCET_STATE_DIR",
            "FAUCET_DEFAULT_AMOUNT_AEKO",
            "FAUCET_DEFAULT_COOLDOWN_HOURS",
            "FAUCET_DEFAULT_DAILY_BUDGET_AEKO",
            "FAUCET_MAX_MANUAL_GRANT_AEKO",
        ):
            reject(text, legacy, where)

    # AEKO_FAUCET_* is intentionally different: it configures the private
    # Faucet Daemon. Public Funding Gateway policy uses FUNDING_*.
    require("AEKO_FAUCET_PER_REQUEST_CAP" in public_env, "public env must retain the private Faucet Daemon hard cap")
    require("FUNDING_DEFAULT_AMOUNT_AEKO" in public_env, "public env must expose Funding Gateway policy separately")
    for where, text in {
        "portable compose": portable,
        "Coolify compose": coolify,
        "Dokploy compose": dokploy,
    }.items():
        require("FUNDING_ALLOWED_ORIGINS:" in text, f"{where} must pass browser funding origins into the operations web container")

    for where, text in {
        "admin env": admin_env,
        "public env": public_env,
        "Explorer production env": explorer_env,
    }.items():
        require(r"\n" not in text, f"{where} contains a literal escaped newline instead of a real line break")

    retired_hosts = (
        "chain.aeko.online",
        "api.testnet.aeko.chain",
        "api.mainnet-beta.aeko.chain",
        "api.mainnet.aeko.chain",
        "api.devnet.aeko.chain",
        "explorer.aeko.chain",
        "release.aeko.chain",
        "api.devnet.aeko.com",
        "github.com/aeko-labs/aeko",
        "github.com/aeko-chain/aeko",
    )
    active_public_surfaces = {
        "Explorer network config": network_config,
        "Explorer docs": docs_text,
        "Explorer production env": explorer_env,
        "README": readme,
        "deployment guide": deployment,
        "backend guide": backend_guide,
        "operations runbook": runbook,
        "CLI v2 network normalization": clap_v2,
        "CLI v3 network normalization": clap_v3,
        "CLI config": cli_config,
        "installer defaults": install_defaults,
        "network environments doc": network_environments,
        "validator guide": validator_guide,
        "legacy updater implementation": install_command,
        "install deploy helper": install_deploy,
    }
    for where, text in active_public_surfaces.items():
        for legacy in retired_hosts:
            reject(text, legacy, where)

    require('"t" | "testnet" => "https://rpc.aeko.online"' in clap_v2, "CLI v2 testnet moniker must resolve to canonical RPC")
    require('"t" | "testnet" => "https://rpc.aeko.online"' in clap_v3, "CLI v3 testnet moniker must resolve to canonical RPC")
    require('"m" | "mainnet-beta"' in clap_v2 and "mainnet is not configured" in clap_v2, "CLI v2 must reject unsupported mainnet moniker clearly")
    require('"d" | "devnet"' in clap_v2 and "devnet is not configured" in clap_v2, "CLI v2 must reject unsupported devnet moniker clearly")
    require('"https://rpc.aeko.online".to_string()' in cli_config, "fresh CLI config must default to the deployed public testnet")
    require('"wss://ws.aeko.online/".to_string()' in cli_config, "CLI websocket derivation must special-case the canonical PubSub host")
    require('JSON_RPC_URL: &str = "https://rpc.aeko.online"' in install_defaults, "installer must default to the canonical public testnet")

    for unsupported_claim in (
        "Mainnet Beta is Live",
        "65,000+ TPS",
        "100k+ TPS",
        "sub-second finality",
        "Phantom (AEKO Fork)",
        "SocialProtocol11111111111111111111111111",
    ):
        reject(docs_text, unsupported_claim, "Explorer docs")

    require("/faucet</a>" not in docs_text, "Explorer docs must not display the legacy /faucet route as the test console")
    require("Open Faucet &amp; Access Page" not in docs_text, "Explorer docs must use Funding/Network Tools terminology")

    require(
        re.search(r"https://gossip\.aeko\.online|gossip\.aeko\.online.*(?:alias|Explorer)|(?:alias|Explorer).*gossip\.aeko\.online", runbook, re.IGNORECASE) is None,
        "operations runbook must never present gossip.aeko.online as an HTTP/Explorer alias",
    )
    require("gossip.aeko.online" in readme and "not an Explorer website" in readme, "README must preserve the gossip-vs-Explorer distinction")
    require("Faucet Daemon" in readme and "Funding Portal" in readme, "README must distinguish private Faucet Daemon from public Funding Portal")
    require("Faucet Daemon" in backend_guide and "Testnet Funding API" in backend_guide, "backend guide must distinguish private daemon from public funding")

    print("[PASS] AEKO public endpoints, funding terminology, and network claims are internally consistent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
