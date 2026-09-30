#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "$REPO_ROOT"

IMAGE_REPOSITORY="${AEKO_CI_IMAGE_REPOSITORY:-aeko-ci}"
IMAGE_TAG="${AEKO_CI_IMAGE_TAG:-full-stack}"
PROJECT="aeko-full-stack-${GITHUB_RUN_ID:-local}"
ARTIFACT_DIR="${AEKO_CI_ARTIFACT_DIR:-$REPO_ROOT/artifacts/full-stack}"
WORK_DIR="$(mktemp -d)"
KEYS_DIR="$WORK_DIR/keys"
mkdir -p "$KEYS_DIR" "$ARTIFACT_DIR"

export AEKO_IMAGE_REPOSITORY="$IMAGE_REPOSITORY"
export AEKO_IMAGE_TAG="$IMAGE_TAG"
export AEKO_KEYS_DIR="$KEYS_DIR"
export AEKO_NETWORK=testnet
export AEKO_BOOTSTRAP=1
export AEKO_RESET_LEDGER=0
export AEKO_REQUIRE_EXISTING_LEDGER=0
export AEKO_FUNDING_AUTHORIZATION_KEY="ci-full-stack-funding-authorization-key-000001"
export AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN="ci-full-stack-explorer-admin-token-00000001"
export AEKO_FUNDING_REQUESTS_PER_10_MIN=20
export AEKO_FAUCET_PER_REQUEST_CAP=100
export ADMIN_PASSWORD="ci-full-stack-admin-password"
export ADMIN_SESSION_SECRET="ci-full-stack-admin-session-secret-000001"
export EXPLORER_DATABASE_URL="postgres://aeko:aeko@postgres:5432/aeko_explorer"
export AEKO_RPC_HOST_PORT=18899
export AEKO_WS_HOST_PORT=18900
export AEKO_GOSSIP_HOST_PORT=18001
export AEKO_EXPLORER_API_HOST_PORT=18088
export AEKO_FRONTEND_HOST_PORT=14000
export AEKO_OPERATIONS_WEB_HOST_PORT=13001
export AEKO_EXPLORER_CORS_ORIGINS="http://127.0.0.1:${AEKO_FRONTEND_HOST_PORT}"

compose() {
  docker compose \
    -p "$PROJECT" \
    -f docker/compose.local.yml \
    -f docker/compose.ci-integration.yml \
    "$@"
}

capture_diagnostics() {
  set +e
  compose ps -a >"$ARTIFACT_DIR/compose-ps.txt" 2>&1
  compose logs --no-color >"$ARTIFACT_DIR/compose.log" 2>&1
  docker ps -a >"$ARTIFACT_DIR/docker-ps.txt" 2>&1
  docker image ls >"$ARTIFACT_DIR/docker-images.txt" 2>&1
  docker system df >"$ARTIFACT_DIR/docker-system-df.txt" 2>&1
}

cleanup() {
  set +e
  capture_diagnostics
  compose down -v --remove-orphans >/dev/null 2>&1
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

fail() {
  echo "[FAIL] $*" >&2
  return 1
}

build_image() {
  local target="$1"
  local image="$2"
  local scope="${3:-$target}"
  echo "==> Building ${image}:${IMAGE_TAG} (${target})"
  docker buildx build \
    --file docker/Dockerfile \
    --target "$target" \
    --tag "${IMAGE_REPOSITORY}/${image}:${IMAGE_TAG}" \
    --cache-from "type=gha,scope=aeko-full-stack-${scope}" \
    --cache-to "type=gha,scope=aeko-full-stack-${scope},mode=min,ignore-error=true" \
    --load \
    .
  docker image inspect "${IMAGE_REPOSITORY}/${image}:${IMAGE_TAG}" >/dev/null
}

build_image validator aeko-validator network
build_image faucet aeko-faucet network
build_image social-bootstrap aeko-social-bootstrap network
build_image protocol-bootstrap aeko-protocol-bootstrap network
build_image tools aeko-tools tools
build_image explorer-api aeko-explorer-api explorer-api
build_image explorer-ui aeko-explorer-ui explorer-ui
build_image operations-web aeko-operations-web operations-web

generate_key() {
  local name="$1"
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -v "$KEYS_DIR:/keys" \
    "${IMAGE_REPOSITORY}/aeko-tools:${IMAGE_TAG}" \
    aeko-keygen new --no-bip39-passphrase --silent --outfile "/keys/${name}"
}

for key in \
  faucet-keypair.json \
  validator-1-keypair.json \
  vote-1-keypair.json \
  stake-keypair.json \
  protocol-authority-keypair.json \
  funding-smoke-keypair.json \
  admin-smoke-keypair.json \
  airdrop-smoke-keypair.json
do
  generate_key "$key"
done

pubkey() {
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -v "$KEYS_DIR:/keys:ro" \
    "${IMAGE_REPOSITORY}/aeko-tools:${IMAGE_TAG}" \
    aeko-keygen pubkey "/keys/$1"
}

FUNDING_SMOKE_ADDRESS="$(pubkey funding-smoke-keypair.json)"
ADMIN_SMOKE_ADDRESS="$(pubkey admin-smoke-keypair.json)"
AIRDROP_SMOKE_ADDRESS="$(pubkey airdrop-smoke-keypair.json)"
export FUNDING_SMOKE_ADDRESS ADMIN_SMOKE_ADDRESS AIRDROP_SMOKE_ADDRESS

compose config >"$ARTIFACT_DIR/compose-rendered.yml"
compose up -d

wait_http() {
  local label="$1"
  local url="$2"
  local attempts="${3:-180}"
  for _ in $(seq 1 "$attempts"); do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      echo "[ok] $label"
      return 0
    fi
    sleep 1
  done
  fail "$label did not become ready: $url"
}

wait_rpc() {
  local label="$1"
  local url="$2"
  for _ in $(seq 1 240); do
    local body
    body="$(curl -fsS -X POST -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' "$url" 2>/dev/null || true)"
    if grep -q '"result":"ok"' <<<"$body"; then
      echo "[ok] $label"
      return 0
    fi
    sleep 1
  done
  fail "$label did not become RPC healthy: $url"
}

wait_rpc "voting validator RPC" "http://127.0.0.1:${AEKO_RPC_HOST_PORT}"

for service in social-bootstrap protocol-bootstrap; do
  cid="$(compose ps -a -q "$service")"
  test -n "$cid" || fail "$service container was not created"
  code="$(docker wait "$cid")"
  test "$code" = "0" || fail "$service exited with code $code"
  echo "[ok] $service completed"
done

wait_http "Explorer API process" "http://127.0.0.1:${AEKO_EXPLORER_API_HOST_PORT}/"
wait_http "Explorer strict health" "http://127.0.0.1:${AEKO_EXPLORER_API_HOST_PORT}/health" 240
wait_http "Scan UI" "http://127.0.0.1:${AEKO_FRONTEND_HOST_PORT}/healthz"
wait_http "Operations Web" "http://127.0.0.1:${AEKO_OPERATIONS_WEB_HOST_PORT}/login"

cors_headers="$(curl -fsS -D - -o /dev/null -X OPTIONS \
  -H "Origin: http://127.0.0.1:${AEKO_FRONTEND_HOST_PORT}" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,x-request-id' \
  "http://127.0.0.1:${AEKO_EXPLORER_API_HOST_PORT}/funding/airdrop")"
grep -qi "access-control-allow-origin: http://127.0.0.1:${AEKO_FRONTEND_HOST_PORT}" <<<"$cors_headers" \
  || fail "Explorer API did not allow the Scan origin for funding writes"
echo "[ok] Explorer API funding CORS accepts the Scan origin"

python3 - <<'PY'
import json
import os
import time
import urllib.request

validator = f"http://127.0.0.1:{os.environ['AEKO_RPC_HOST_PORT']}"

def rpc_payload(url, method, params=None):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.load(res)

def rpc(url, method, params=None):
    payload = rpc_payload(url, method, params)
    if payload.get("error"):
        raise RuntimeError(f"{method} on {url}: {payload['error']}")
    return payload["result"]

if rpc(validator, "getHealth") != "ok":
    raise RuntimeError("validator RPC health check failed")
genesis = rpc(validator, "getGenesisHash")
slot_one = int(rpc(validator, "getSlot", [{"commitment": "confirmed"}]))
time.sleep(1)
slot_two = int(rpc(validator, "getSlot", [{"commitment": "confirmed"}]))
if slot_two < slot_one:
    raise RuntimeError(f"slot regressed: {slot_one} -> {slot_two}")
print(f"[ok] validator RPC shares the active genesis {genesis}; slot {slot_one}->{slot_two}")

recipient = os.environ["FUNDING_SMOKE_ADDRESS"]
payload = rpc_payload(validator, "requestFunding", [recipient, 1])
error = payload.get("error") or {}
if error.get("code") != -32600:
    raise RuntimeError(
        f"voting validator unexpectedly accepted unauthenticated requestFunding: {payload}"
    )
print("[ok] voting validator RPC protects requestFunding with the settlement credential")
PY

AEKO_NETWORK=testnet \
AEKO_EXPLORER_API_URL="http://127.0.0.1:${AEKO_EXPLORER_API_HOST_PORT}" \
AEKO_OPERATIONS_URL="http://127.0.0.1:${AEKO_OPERATIONS_WEB_HOST_PORT}" \
AEKO_RPC_URL="http://127.0.0.1:${AEKO_RPC_HOST_PORT}" \
AEKO_FUNDING_SMOKE_ADDRESS="$FUNDING_SMOKE_ADDRESS" \
ADMIN_PASSWORD="$ADMIN_PASSWORD" \
python3 scripts/smoke-funding-e2e.py

python3 - <<'PY'
import http.cookiejar
import json
import os
import time
import urllib.error
import urllib.request

rpc_url = f"http://127.0.0.1:{os.environ['AEKO_RPC_HOST_PORT']}"
scan = f"http://127.0.0.1:{os.environ['AEKO_FRONTEND_HOST_PORT']}"
admin = f"http://127.0.0.1:{os.environ['AEKO_OPERATIONS_WEB_HOST_PORT']}"
api = f"http://127.0.0.1:{os.environ['AEKO_EXPLORER_API_HOST_PORT']}"
admin_address = os.environ["ADMIN_SMOKE_ADDRESS"]
airdrop_address = os.environ["AIRDROP_SMOKE_ADDRESS"]
password = os.environ["ADMIN_PASSWORD"]
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def json_request(url, payload=None, client=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data is not None else "GET")
    try:
        if client is not None:
            response = client.open(req, timeout=30)
        else:
            response = urllib.request.urlopen(req, timeout=30)
        with response as res:
            return json.load(res)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"{url}: HTTP {exc.code}: {detail}") from exc

def rpc(method, params=None):
    payload = json_request(rpc_url, {"jsonrpc":"2.0","id":1,"method":method,"params":params or []})
    if payload.get("error"):
        raise RuntimeError(f"RPC {method}: {payload['error']}")
    return payload["result"]

def balance(address):
    value = rpc("getBalance", [address, {"commitment":"confirmed"}])
    return int(value["value"] if isinstance(value, dict) else value)

def wait_balance(address, minimum, label):
    last = -1
    for _ in range(120):
        last = balance(address)
        if last >= minimum:
            print(f"[ok] {label}: {last} lamports")
            return last
        time.sleep(0.5)
    raise RuntimeError(f"{label} did not reach {minimum}; last={last}")

json_request(admin + "/api/login", {"password": password}, opener)
if not any(cookie.name == "aeko_admin" for cookie in jar):
    raise RuntimeError("Operations Web did not establish Admin session")

before = balance(admin_address)
sent = json_request(
    admin + "/api/admin/funding/send",
    {"address": admin_address, "amountAeko": 2},
    opener,
)["data"]
if sent.get("status") not in {"submitted", "confirmed"}:
    raise RuntimeError(f"direct Admin funding returned unexpected state: {sent}")
if not sent.get("signature"):
    raise RuntimeError(f"direct Admin funding returned no signature: {sent}")
wait_balance(admin_address, before + 2_000_000_000, "direct Admin funding reached wallet")

air_before = balance(airdrop_address)
airdrop = json_request(
    api + "/funding/airdrop",
    {"address": airdrop_address, "amountAeko": 1},
)["data"]
if not airdrop.get("signature"):
    raise RuntimeError(f"developer airdrop returned no signature: {airdrop}")
wait_balance(airdrop_address, air_before + 1_000_000_000, "developer airdrop reached wallet")

history = json_request(admin + "/api/admin/funding/history?limit=100", client=opener)["data"]
if not any(row.get("address") == admin_address and row.get("confirmed") is True for row in history):
    raise RuntimeError("direct Admin funding was not recorded in confirmed funding history")

account = None
for _ in range(120):
    try:
        account = json_request(api + "/accounts/" + admin_address)["data"]
        if account:
            break
    except Exception:
        pass
    time.sleep(0.5)
if not account:
    raise RuntimeError("Explorer account API did not expose the funded wallet")
native = int(account.get("profile", {}).get("nativeBalance", account.get("account", {}).get("lamports", 0)))
if native < 2_000_000_000:
    raise RuntimeError(f"Explorer account balance is stale or invalid: {native}")
print("[ok] Explorer account API reflects funded wallet state")
PY

AEKO_RPC_URL="http://127.0.0.1:${AEKO_RPC_HOST_PORT}" \
AEKO_EXPLORER_API_URL="http://127.0.0.1:${AEKO_EXPLORER_API_HOST_PORT}" \
python3 scripts/smoke-aeko-social.py

AEKO_RPC_URL="http://127.0.0.1:${AEKO_RPC_HOST_PORT}" \
AEKO_EXPLORER_API_URL="http://127.0.0.1:${AEKO_EXPLORER_API_HOST_PORT}" \
python3 scripts/smoke-aeko-protocol.py

python3 - <<'PY'
import json
import os
import urllib.request

api = f"http://127.0.0.1:{os.environ['AEKO_EXPLORER_API_HOST_PORT']}"
for path in ["/overview", "/network/readiness", "/social/status"]:
    with urllib.request.urlopen(api + path, timeout=30) as res:
        payload = json.load(res)
    if "data" not in payload:
        raise RuntimeError(f"{path} did not return the Explorer data envelope")
print("[ok] Explorer overview, readiness, and Social API contracts respond")
PY

capture_diagnostics
echo "[PASS] built Docker images boot together and pass validator RPC, Faucet, funding, airdrop, wallet/account, Explorer, Social, Protocol, Scan and Operations checks"
