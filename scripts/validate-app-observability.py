#!/usr/bin/env python3
"""Static production-observability contracts for deployable AEKO applications."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ContractFailure(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ContractFailure(message)


def read(relative: str) -> str:
    path = ROOT / relative
    require(path.is_file(), f"missing observability contract file: {relative}")
    return path.read_text(encoding="utf-8")


def main() -> int:
    backend_main = read("apps/explorer/backend/src/main.rs")
    backend_logging = read("apps/explorer/backend/src/observability/mod.rs")
    backend_http = read("apps/explorer/backend/src/http/mod.rs")
    backend_bootstrap = read("apps/explorer/backend/src/bootstrap/mod.rs")
    scan_main = read("apps/explorer/web/src/main.jsx")
    scan_client = read("apps/explorer/web/src/observability/logger.js")
    scan_server = read("docker/explorer-ui-server.mjs")
    admin_logger = read("apps/admin/src/lib/logger.ts")
    admin_middleware = read("apps/admin/src/middleware.ts")
    admin_telemetry = read("apps/admin/src/app/api/telemetry/client/route.ts")

    require(
        backend_main.index("observability::init()") < backend_main.index("ExplorerBackendConfig::from_env()"),
        "Explorer logging must initialize before fallible runtime configuration",
    )
    for expected in (
        "AEKO_EXPLORER_LOG_FORMAT",
        "AEKO_EXPLORER_LOG_FILTER",
        ".json()",
        "std::panic::set_hook",
        "service = SERVICE",
        "endpoint_origin",
    ):
        require(expected in backend_logging, f"Explorer structured logging missing {expected}")
    require("rpc_origin = %observability::endpoint_origin(&backend.rpc_url)" in backend_bootstrap, "Explorer startup logs must redact RPC credentials")
    for expected in (
        "SetRequestIdLayer",
        "PropagateRequestIdLayer",
        '"http.request"',
        "DefaultOnFailure",
        "http.path = %request.uri().path()",
    ):
        require(expected in backend_http, f"Explorer HTTP logging missing {expected}")

    require("installGlobalErrorLogging()" in scan_main, "Scan must install browser error telemetry")
    require("/api/telemetry/client" in scan_client, "Scan browser logger must use same-origin telemetry")
    for expected in (
        "AEKO_LOG_LEVEL",
        "AEKO_LOG_FORMAT",
        "CLIENT_TELEMETRY_PATH",
        "X-Request-Id",
        "http_request_completed",
        "process_uncaught_exception",
        "const server = createServer",
        "function readRequestBody(req, maxBytes)",
        "if (size > maxBytes)",
    ):
        require(expected in scan_server, f"Scan production server logging missing {expected}")

    for expected in (
        "AEKO_LOG_LEVEL",
        "AEKO_LOG_FORMAT",
        "SENSITIVE_KEY",
        "[REDACTED]",
        "aeko-operations-web",
    ):
        require(expected in admin_logger, f"Admin structured logger missing {expected}")
    require("x-request-id" in admin_middleware, "Admin middleware must propagate request IDs")
    require("'/api/telemetry/client'" in admin_middleware, "Admin login errors must reach the bounded public telemetry endpoint")
    require("MAX_EVENTS_PER_WINDOW = 300" in admin_telemetry, "Admin public telemetry must be rate limited")
    require("browser_error" in admin_telemetry, "Admin must collect authenticated browser errors")

    app_envs = (
        "apps/explorer/backend/.env.coolify.example",
        "apps/explorer/web/.env.coolify.example",
        "apps/admin/.env.coolify.example",
    )
    require("AEKO_EXPLORER_LOG_FORMAT=" in read(app_envs[0]), "Explorer API env must document structured logging")
    require("AEKO_LOG_LEVEL=" in read(app_envs[1]), "Scan env must document app log level")
    require("AEKO_LOG_LEVEL=" in read(app_envs[2]), "Admin env must document app log level")

    app_composes = (
        "apps/explorer/backend/compose.coolify.yml",
        "apps/explorer/web/compose.coolify.yml",
        "apps/admin/compose.coolify.yml",
    )
    for relative in app_composes:
        compose = read(relative)
        require("x-logging: &default-logging" in compose, f"{relative} must bound container logs")
    require("AEKO_EXPLORER_LOG_FORMAT:" in read(app_composes[0]), "Explorer API Compose must configure JSON logging")
    require("AEKO_LOG_LEVEL:" in read(app_composes[1]), "Scan Compose must configure app log level")
    require("AEKO_LOG_LEVEL:" in read(app_composes[2]), "Admin Compose must configure app log level")

    for retired in (
        "docker/coolify/explorer-api/compose.yml",
        "docker/coolify/explorer-ui/compose.yml",
        "docker/coolify/operations-web/compose.yml",
    ):
        require(not (ROOT / retired).exists(), f"retired app-owned Coolify Compose still exists: {retired}")

    print("application ownership + production observability contracts: ok")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractFailure as exc:
        print(f"[FAIL] {exc}")
        raise SystemExit(1) from exc
