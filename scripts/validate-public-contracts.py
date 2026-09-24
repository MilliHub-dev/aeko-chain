#!/usr/bin/env python3
"""Guard AEKO deployment URL ownership, funding vocabulary and public contracts."""

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


def require_empty_assignment(text: str, name: str, where: str) -> None:
    require(
        re.search(rf"^{re.escape(name)}=$", text, re.MULTILINE) is not None,
        f"{where} must leave {name} deployment-configurable",
    )


def main() -> int:
    admin_env = read("apps/admin/.env.local.example")
    public_env = read("docker/env.public.example")
    portable = read("docker/compose.local.yml")
    coolify = read("docker/compose.coolify.yml")
    dokploy = read("docker/compose.dokploy.yml")
    explorer_example = read("apps/explorer/web/.env.example")
    explorer_dockerfile = read("docker/Dockerfile")
    explorer_entrypoint = read("docker/explorer-ui-entrypoint.sh")
    explorer_server = read("docker/explorer-ui-server.mjs")
    explorer_vite = read("apps/explorer/web/vite.config.js")
    network_config = read("apps/explorer/web/src/utils/networkConfig.js")
    nft_demo = read("apps/explorer/web/src/data/nftDemoExamples.js")
    funding_policy = read("apps/admin/src/app/api/funding/policy/route.ts")
    funding_request = read("apps/admin/src/app/api/funding/request/route.ts")
    funding_airdrop = read("apps/admin/src/app/api/funding/airdrop/route.ts")
    funding_internal = read("apps/admin/src/app/api/internal/funding/requests/route.ts")
    funding_admin_client = read("apps/admin/src/lib/funding-admin-client.ts")
    middleware = read("apps/admin/src/middleware.ts")
    funding_cors = read("apps/admin/src/lib/funding-cors.ts")
    ip_throttle = read("apps/admin/src/lib/ip-throttle.ts")
    settings_page = read("apps/admin/src/app/(admin)/settings/page.tsx")
    settings_route = read("apps/admin/src/app/api/settings/route.ts")
    explorer_proxy = read("apps/admin/src/app/api/explorer/[...path]/route.ts")
    protocol_page = read("apps/admin/src/app/(admin)/protocol/page.tsx")
    social_page = read("apps/admin/src/app/(admin)/social/page.tsx")
    marketplace_page = read("apps/admin/src/app/(admin)/marketplace/page.tsx")
    sidebar = read("apps/admin/src/components/sidebar.tsx")
    app_settings = read("apps/explorer/web/src/utils/appSettings.js")
    safe_defaults_migration = read("apps/explorer/backend/migrations/0008_safe_public_feature_defaults.sql")
    clap_v2 = read("clap-utils/src/input_validators.rs")
    clap_v3 = read("clap-v3-utils/src/input_validators.rs")
    cli_config = read("cli-config/src/config.rs")
    install_defaults = read("install/src/defaults.rs")
    deploy_script = read("scripts/deploy-testnet.sh")
    docs_text = read("apps/explorer/web/src/data/docs.json")
    readme = read("README.md")
    backend_guide = read("BACKEND-DEV-GUIDE.md")
    runbook = read("docs/operations/testnet-runbook.md")

    docs = json.loads(docs_text)
    require(isinstance(docs.get("content"), dict), "Explorer docs.json must contain a content object")

    public_vars = (
        "AEKO_PUBLIC_RPC_URL",
        "AEKO_PUBLIC_WS_URL",
        "AEKO_PUBLIC_FUNDING_URL",
        "FUNDING_ALLOWED_ORIGINS",
    )
    for name in public_vars:
        require_empty_assignment(public_env, name, "docker/env.public.example")

    for retired in (
        "AEKO_PUBLIC_EXPLORER_API_URL",
        "AEKO_PUBLIC_EXPLORER_URL",
        "AEKO_PUBLIC_ADMIN_URL",
        "AEKO_MAINNET_EXPLORER_API_URL",
        "AEKO_MAINNET_EXPLORER_URL",
        "FUNDING_CLIENT_API_KEY",
    ):
        reject(public_env, retired, "docker/env.public.example")

    require(
        "AEKO_OPERATIONS_ROLE=admin" in admin_env
        and "AEKO_INTERNAL_EXPLORER_API_URL=" in admin_env
        and "AEKO_INTERNAL_FUNDING_URL=" in admin_env
        and "FUNDING_ADMIN_API_KEY=" in admin_env,
        "Operations Web env example must document the private Admin role and service dependencies",
    )
    require(
        "FUNDING_IP_REQUESTS_PER_10_MIN=" in admin_env,
        "Operations Web env example must expose the funding request throttle",
    )
    require(
        "FUNDING_IP_REQUESTS_PER_10_MIN" in ip_throttle,
        "Funding throttle must read the documented funding request limit",
    )
    reject(ip_throttle, "FAUCET_IP_REQUESTS_PER_10_MIN", "funding throttle")

    for name in (
        "AEKO_MAINNET_RPC_URL",
        "AEKO_MAINNET_WS_URL",
        "AEKO_DEMO_RPC_URL",
        "AEKO_DEMO_COLLECTION",
        "AEKO_DEMO_TOKEN",
        "AEKO_DEMO_METADATA_URI",
    ):
        require_empty_assignment(public_env, name, "docker/env.public.example")

    for name in (
        "AEKO_PUBLIC_RPC_URL",
        "AEKO_PUBLIC_WS_URL",
        "AEKO_PUBLIC_FUNDING_URL",
        "AEKO_INTERNAL_EXPLORER_API_URL",
        "AEKO_MAINNET_RPC_URL",
        "AEKO_MAINNET_WS_URL",
        "AEKO_INTERNAL_MAINNET_EXPLORER_API_URL",
        "AEKO_DEMO_RPC_URL",
        "AEKO_DEMO_COLLECTION",
        "AEKO_DEMO_TOKEN",
        "AEKO_DEMO_METADATA_URI",
    ):
        require(
            re.search(rf"^{re.escape(name)}=", explorer_example, re.MULTILINE) is not None,
            f"Explorer web env example must expose key {name}",
        )

    for retired in (
        "AEKO_PUBLIC_EXPLORER_API_URL",
        "AEKO_PUBLIC_EXPLORER_URL",
        "AEKO_PUBLIC_ADMIN_URL",
        "AEKO_MAINNET_EXPLORER_API_URL",
        "AEKO_MAINNET_EXPLORER_URL",
    ):
        reject(explorer_example, retired, "Explorer web env example")

    for where, text in (
        ("Explorer web env example", explorer_example),
        ("Explorer Vite config", explorer_vite),
        ("Explorer network config", network_config),
        ("Explorer NFT demo config", nft_demo),
        ("Explorer Dockerfile", explorer_dockerfile),
    ):
        reject(text, "VITE_AEKO_", where)

    require(
        "loadEnv" in explorer_vite
        and "command === 'serve'" in explorer_vite
        and "AEKO_PUBLIC" in explorer_vite
        and "AEKO_MAINNET" in explorer_vite
        and "__AEKO_DEV_RUNTIME_CONFIG__" in explorer_vite,
        "Explorer local Vite mode must read whitelisted public-testnet/mainnet env endpoints only during dev",
    )
    require(
        "__AEKO_RUNTIME_CONFIG__" in network_config
        and "__AEKO_DEV_RUNTIME_CONFIG__" in network_config
        and "runtime.testnet" in network_config
        and "runtime.mainnet" in network_config,
        "Explorer network config must consume one normalized testnet/mainnet runtime shape",
    )
    require(
        "http://127.0.0.1:8899" in network_config
        and "ws://127.0.0.1:8900" in network_config
        and "/api/explorer/testnet" in network_config,
        "Explorer local mode must retain loopback chain defaults and same-origin indexed reads",
    )

    for name in (
        "AEKO_PUBLIC_RPC_URL",
        "AEKO_PUBLIC_WS_URL",
        "AEKO_PUBLIC_FUNDING_URL",
    ):
        require((': "${' + name + ':?') in explorer_entrypoint, f"Explorer runtime entrypoint must require {name}")
    for retired in (
        "AEKO_PUBLIC_EXPLORER_API_URL",
        "AEKO_PUBLIC_EXPLORER_URL",
        "AEKO_MAINNET_EXPLORER_API_URL",
        "AEKO_MAINNET_EXPLORER_URL",
    ):
        reject(explorer_entrypoint, retired, "Explorer runtime entrypoint")
    require(
        "AEKO_INTERNAL_EXPLORER_API_URL" in explorer_server
        and "/api/explorer/testnet" in explorer_server
        and "Explorer UI proxy is read-only" in explorer_server,
        "Explorer UI server must own a read-only same-origin proxy to the private Explorer backend",
    )
    require(
        "const config = { testnet, mainnet, demo }" in explorer_entrypoint,
        "Explorer entrypoint must normalize deployment env into the browser testnet/mainnet/demo contract",
    )
    require("/app/dist/runtime-config.js" in explorer_entrypoint, "Explorer entrypoint must write runtime-config.js into the served bundle")
    require(
        "getDemoConfig" in nft_demo and "AEKO_DEMO_" not in nft_demo,
        "Explorer NFT demo must consume normalized runtime demo config rather than environment names",
    )

    for label, compose in (("Coolify", coolify), ("Dokploy", dokploy)):
        require(re.search(r"^  funding-gateway:\s*$", compose, re.MULTILINE) is not None, f"{label} must deploy a dedicated funding-gateway service")
        require(re.search(r"^  operations-web:\s*$", compose, re.MULTILINE) is not None, f"{label} must deploy operations-web")
        require(compose.count("aeko-operations-web:") >= 2, f"{label} must run isolated funding and Admin instances from the validated Operations image")
        require("AEKO_OPERATIONS_ROLE: funding" in compose, f"{label} funding gateway must run in funding role")
        require("AEKO_OPERATIONS_ROLE: admin" in compose, f"{label} operations web must run in admin role")
        require("AEKO_RPC_URL: ${AEKO_INTERNAL_RPC_URL:-http://validator:8899}" in compose, f"{label} services must use internal validator DNS")
        require("AEKO_INTERNAL_EXPLORER_API_URL: ${AEKO_INTERNAL_EXPLORER_API_URL:-http://explorer-api:8088}" in compose, f"{label} Explorer consumers must use private Docker DNS")
        require("AEKO_INTERNAL_FUNDING_URL: ${AEKO_INTERNAL_FUNDING_URL:-http://funding-gateway:3001}" in compose, f"{label} Admin must use private Funding Gateway DNS")
        require("FUNDING_ADMIN_API_KEY: ${FUNDING_ADMIN_API_KEY:?}" in compose, f"{label} must authenticate private Admin-to-funding calls")
        require("FUNDING_GATEWAY_KEY: ${FUNDING_GATEWAY_KEY:?}" in compose, f"{label} Funding Gateway must own protected airdrop authorization")
        require("FUNDING_ALLOWED_ORIGINS: ${FUNDING_ALLOWED_ORIGINS:?}" in compose, f"{label} Funding Gateway must receive browser CORS origins explicitly")
        require("AEKO_FAUCET_ADDRESS: ${AEKO_INTERNAL_FAUCET_ADDRESS:-faucet:9900}" in compose, f"{label} validator must reach the private Faucet Daemon by Docker DNS")
        for name in (
            "AEKO_PUBLIC_RPC_URL",
            "AEKO_PUBLIC_WS_URL",
            "AEKO_PUBLIC_FUNDING_URL",
        ):
            require((name + ": ${" + name + ":?}") in compose, f"{label} Explorer/Funding runtime must receive {name}")
        require("AEKO_INTERNAL_MAINNET_EXPLORER_API_URL: ${AEKO_INTERNAL_MAINNET_EXPLORER_API_URL:-}" in compose, f"{label} Explorer UI must accept optional private mainnet Explorer upstream")
        for retired in (
            "AEKO_PUBLIC_EXPLORER_API_URL",
            "AEKO_PUBLIC_EXPLORER_URL",
            "AEKO_PUBLIC_ADMIN_URL",
            "AEKO_MAINNET_EXPLORER_API_URL",
            "AEKO_MAINNET_EXPLORER_URL",
            "FUNDING_CLIENT_API_KEY",
            "AEKO_EXPLORER_URL:",
        ):
            reject(compose, retired, f"{label} compose")
        reject(compose, "aeko-admin:", f"{label} compose")
        reject(compose, "FUNDING_PUBLIC_HOST", f"{label} compose")
        reject(compose, "ADMIN_PUBLIC_HOST", f"{label} compose")

    require("AEKO_OPERATIONS_ROLE" in middleware, "Operations middleware must isolate Admin and Funding runtime roles")
    require("AEKO_PUBLIC_FUNDING_URL" in middleware, "Funding role must recognize its public funding host")
    reject(middleware, "AEKO_PUBLIC_ADMIN_URL", "operations middleware")
    for topology_name in ("AEKO_PUBLIC_EXPLORER_URL", "AEKO_PUBLIC_ADMIN_URL", "explorerUrl", "adminUrl"):
        reject(funding_policy, topology_name, "public funding policy")
        reject(funding_airdrop, topology_name, "public funding airdrop")
    require(
        "requestFundingApproval(address, 'public')" in funding_request
        and "FUNDING_CLIENT_API_KEY" not in funding_request,
        "Every public funding request must enter the same operator-approval queue",
    )
    require(
        "isAuthorizedFundingAdminRequest" in funding_internal
        and "decideFundingRequest" in funding_internal,
        "Funding Gateway private Admin API must authenticate before mutating queue state",
    )
    require(
        "AEKO_INTERNAL_FUNDING_URL" in funding_admin_client
        and "x-aeko-funding-admin-key" in funding_admin_client,
        "Admin funding controls must use the private Funding Gateway client",
    )
    require("FUNDING_ALLOWED_ORIGINS" in funding_cors, "Funding CORS must be deployment-configured")
    require(
        "fetch('/api/settings'" in settings_page,
        "Admin Settings UI must call the authenticated Next.js /api/settings control plane",
    )
    require(
        "${EXPLORER_URL}/settings" in settings_route,
        "Next.js settings route must proxy Explorer backend /settings",
    )
    require(
        "x-aeko-settings-token" in settings_route,
        "Next.js settings mutation must authenticate to Explorer backend",
    )
    require(
        "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN" not in settings_page,
        "private Explorer settings token must never appear in Admin client code",
    )
    require(
        "AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN" in settings_route
        and "AEKO_INTERNAL_EXPLORER_API_URL" in settings_route,
        "private Explorer settings token must remain server-side in the Next.js route",
    )
    require(
        "status: res.status" in explorer_proxy,
        "Admin Explorer proxy must preserve upstream HTTP status codes",
    )
    require(
        "registry/protocol" in protocol_page and "protocol/status" in protocol_page,
        "Admin Protocol page must consume the Explorer protocol registry and live status",
    )
    require(
        "registry/social" in social_page and "social/status" in social_page,
        "Admin Social page must consume the canonical SocialFi registry and live status",
    )
    require(
        "/api/explorer/protocol/status" in marketplace_page,
        "Admin Marketplace must derive program readiness from Explorer protocol status",
    )
    require(
        "'/protocol'" in sidebar,
        "Admin navigation must expose the Protocol operations page",
    )
    for hardcoded_program_id in (
        "gBxS1f6uyyGPuW5MzGBukidSb71jdsCb5fZaoSzULE5",
        "k7FaK87WHGVXzkaoHb7CdVPgkKDQhZ29VLDeBVbDfYn",
    ):
        reject(marketplace_page, hardcoded_program_id, "Admin Marketplace")
    require(
        "nftDemoEnabled: true" in app_settings
        and "networkConsoleEnabled: false" in app_settings
        and "nftLiveFlowEnabled: false" in app_settings
        and "nftAdvancedToolsEnabled: false" in app_settings,
        "Explorer safe settings must expose the base NFT demo while privileged surfaces fail closed",
    )
    require(
        "ALTER COLUMN nft_demo_enabled SET DEFAULT TRUE" in safe_defaults_migration
        and "ALTER COLUMN nft_live_flow_enabled SET DEFAULT FALSE" in safe_defaults_migration
        and "ALTER COLUMN nft_advanced_tools_enabled SET DEFAULT FALSE" in safe_defaults_migration
        and "revision = 1" in safe_defaults_migration,
        "safe feature-default migration must preserve existing operator-customized settings",
    )
    reject(middleware, "FAUCET_PUBLIC_HOST", "operations middleware")
    reject(middleware, "ADMIN_PUBLIC_HOST", "operations middleware")
    reject(middleware, "/api/faucet", "operations middleware")
    reject(middleware, "'/faucet'", "operations middleware")

    public_host_literal = re.compile(
        r"(?:https?|wss?)://(?:rpc|ws|api|scan|fund|admin|chain)\.aeko\.online\b",
        re.IGNORECASE,
    )
    runtime_surfaces = {
        "funding policy": funding_policy,
        "funding request": funding_request,
        "funding airdrop": funding_airdrop,
        "operations middleware": middleware,
        "funding CORS": funding_cors,
        "Explorer network config": network_config,
        "CLI v2 network normalization": clap_v2,
        "CLI v3 network normalization": clap_v3,
        "CLI config": cli_config,
        "installer defaults": install_defaults,
        "deploy helper": deploy_script,
    }
    for where, text in runtime_surfaces.items():
        require(public_host_literal.search(text) is None, f"{where} hardcodes a public aeko.online deployment URL")

    # Protect the full deployable application/source surface, not only the
    # currently known endpoint modules. Documentation, tests and examples are
    # intentionally outside this runtime scan.
    source_roots = (
        ROOT / "apps" / "admin" / "src",
        ROOT / "apps" / "explorer" / "web" / "src",
        ROOT / "apps" / "sdk" / "js" / "src",
        ROOT / "apps" / "sdk" / "node" / "src",
        ROOT / "apps" / "sdk" / "python" / "src",
        ROOT / "apps" / "sdk" / "rust-client" / "src",
        ROOT / "cli-config" / "src",
        ROOT / "clap-utils" / "src",
        ROOT / "clap-v3-utils" / "src",
        ROOT / "install" / "src",
    )
    source_suffixes = {".js", ".jsx", ".ts", ".tsx", ".py", ".rs"}
    runtime_files: list[Path] = []
    for source_root in source_roots:
        if not source_root.is_dir():
            continue
        runtime_files.extend(
            path
            for path in source_root.rglob("*")
            if path.is_file()
            and path.suffix in source_suffixes
            and ".test." not in path.name
            and ".spec." not in path.name
        )

    for source_file in runtime_files:
        text = source_file.read_text(encoding="utf-8")
        relative = source_file.relative_to(ROOT)
        require(
            public_host_literal.search(text) is None,
            f"{relative} hardcodes a public aeko.online deployment URL",
        )

    for label, text in (("CLI v2", clap_v2), ("CLI v3", clap_v3)):
        require("AEKO_TESTNET_RPC_URL" in text, f"{label} testnet moniker must read AEKO_TESTNET_RPC_URL")
        require("AEKO testnet URL is deployment configuration" in text, f"{label} must fail clearly when testnet URL is unset")
    require('env::var("AEKO_RPC_URL")' in cli_config, "CLI config must accept AEKO_RPC_URL")
    require('env::var("AEKO_TESTNET_RPC_URL")' in cli_config, "CLI config must accept AEKO_TESTNET_RPC_URL")
    require('"http://localhost:8899".to_string()' in cli_config, "CLI source fallback must remain local-only")
    require("build_target operations-web" in deploy_script, "deploy helper must build Operations Web")
    require("operations-web" in deploy_script and "docker compose" in deploy_script, "deploy helper must start Operations Web")
    for name in (
        "AEKO_PUBLIC_RPC_URL",
        "AEKO_PUBLIC_WS_URL",
        "AEKO_PUBLIC_EXPLORER_API_URL",
        "AEKO_PUBLIC_EXPLORER_URL",
        "AEKO_PUBLIC_FUNDING_URL",
        "AEKO_PUBLIC_ADMIN_URL",
    ):
        require(name in deploy_script, f"deploy helper must expose {name} through environment configuration")

    for where, text in {
        "admin env": admin_env,
        "public env": public_env,
        "Explorer web env example": explorer_example,
    }.items():
        require(r"\n" not in text, f"{where} contains a literal escaped newline instead of a real line break")

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
            "FAUCET_IP_REQUESTS_PER_10_MIN",
        ):
            reject(text, legacy, where)

    require("AEKO_FAUCET_PER_REQUEST_CAP" in public_env, "public env must keep the private Faucet Daemon hard cap")
    require("FUNDING_DEFAULT_AMOUNT_AEKO" in public_env, "public env must keep Funding Gateway policy separate")

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
    for where, text in runtime_surfaces.items():
        for legacy in retired_hosts:
            reject(text, legacy, where)
    for source_file in runtime_files:
        text = source_file.read_text(encoding="utf-8")
        relative = str(source_file.relative_to(ROOT))
        for legacy in retired_hosts:
            reject(text, legacy, relative)

    for unsupported_claim in (
        "Mainnet Beta is Live",
        "65,000+ TPS",
        "100k+ TPS",
        "sub-second finality",
        "Phantom (AEKO Fork)",
        "SocialProtocol11111111111111111111111111",
    ):
        reject(docs_text, unsupported_claim, "Explorer docs")

    require("/faucet</a>" not in docs_text, "Explorer docs must not advertise the removed /faucet route")
    require("Open Faucet &amp; Access Page" not in docs_text, "Explorer docs must use Funding/Network Tools terminology")
    require(
        re.search(r"https://gossip\.aeko\.online|temporary\s+alias|Host\([^\n]*gossip\.aeko\.online", runbook, re.IGNORECASE) is None,
        "operations runbook must never present gossip.aeko.online as an HTTP/Explorer alias",
    )
    require("gossip.aeko.online" in readme and "not an Explorer website" in readme, "README must preserve the gossip-vs-Explorer distinction")
    require("Faucet Daemon" in readme and "Funding Portal" in readme, "README must distinguish private Faucet Daemon from public Funding Portal")
    require("Faucet Daemon" in backend_guide and "Testnet Funding API" in backend_guide, "backend guide must distinguish private daemon from public funding")
    for obsolete_social_registry_name in ("AEKO_REWARD_VAULT=<", "AEKO_STAKE_VAULT=<"):
        reject(readme, obsolete_social_registry_name, "README")

    print("[PASS] public endpoints are deployment-configured and funding/network roles are distinct")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
