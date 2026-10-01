#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "$REPO_ROOT"

: "${AEKO_CI_IMAGE_TAG:?AEKO_CI_IMAGE_TAG is required}"
: "${AEKO_CI_CLI_ARCHIVE:?AEKO_CI_CLI_ARCHIVE is required}"

IMAGE_REPOSITORY="${AEKO_CI_IMAGE_REPOSITORY:-aeko-ci}"
IMAGE_TAG="$AEKO_CI_IMAGE_TAG"
CONTRACT_SCOPE="${AEKO_CI_CONTRACT_SCOPE:-full}"
case "$CONTRACT_SCOPE" in
  chain|application|full) ;;
  *) echo "Unsupported AEKO_CI_CONTRACT_SCOPE: $CONTRACT_SCOPE" >&2; exit 2 ;;
esac
CLI_ARCHIVE="$AEKO_CI_CLI_ARCHIVE"
PROJECT="aeko-runtime-${GITHUB_RUN_ID:-local}"
ARTIFACT_DIR="${AEKO_CI_ARTIFACT_DIR:-$REPO_ROOT/artifacts/runtime-contract}"
WORK_DIR="$(mktemp -d)"
CLI_DIR="$WORK_DIR/cli"
SMOKE_KEYS="$WORK_DIR/smoke-keys"
POSTGRES_CONTAINER="${PROJECT}-postgres"
KEYS_DIR=/data/aeko/keys
mkdir -p "$ARTIFACT_DIR" "$CLI_DIR" "$SMOKE_KEYS"

export AEKO_IMAGE_REPOSITORY="$IMAGE_REPOSITORY"
export AEKO_IMAGE_TAG="$IMAGE_TAG"
export AEKO_NETWORK=testnet
export AEKO_ALLOW_CHAIN_KEY_GENERATION=1
export AEKO_RESET_LEDGER=1
export AEKO_REQUIRE_EXISTING_LEDGER=0
export AEKO_GOSSIP_HOST=127.0.0.1
export AEKO_FUNDING_AUTHORIZATION_KEY="ci-runtime-funding-authorization-key-000001"
export AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN="ci-runtime-explorer-settings-token-000001"
export AEKO_FUNDING_REQUESTS_PER_10_MIN=30
export AEKO_FUNDING_RECONCILE_INTERVAL_SECS=1
export AEKO_FAUCET_PER_REQUEST_CAP=100
export AEKO_EXPLORER_MAX_READY_LAG_SLOTS=256
export AEKO_LEDGER_LIMIT=500000
export AEKO_MAX_FULL_SNAPSHOTS=1
export AEKO_MAX_INCREMENTAL_SNAPSHOTS=1
export AEKO_ACCOUNTS_DB_CACHE_LIMIT_MB=256
export AEKO_ACCOUNTS_INDEX_MEMORY_LIMIT_MB=256
export AEKO_MIN_FREE_DISK_KB=262144
export EXPLORER_DATABASE_URL="postgres://aeko:aeko@postgres:5432/aeko_explorer"
export ADMIN_PASSWORD="ci-runtime-admin-password"
export ADMIN_SESSION_SECRET="ci-runtime-admin-session-secret-000001"

compose() {
  docker compose -p "$PROJECT" -f docker/compose.coolify.yml "$@"
}

capture_diagnostics() {
  set +e
  compose ps -a >"$ARTIFACT_DIR/compose-ps.txt" 2>&1
  compose logs --no-color >"$ARTIFACT_DIR/compose.log" 2>&1
  docker ps -a >"$ARTIFACT_DIR/docker-ps.txt" 2>&1
  docker image ls >"$ARTIFACT_DIR/docker-images.txt" 2>&1
  docker logs "$POSTGRES_CONTAINER" >"$ARTIFACT_DIR/postgres.log" 2>&1
  docker system df >"$ARTIFACT_DIR/docker-system-df.txt" 2>&1
}

cleanup() {
  set +e
  capture_diagnostics
  compose down -v --remove-orphans >/dev/null 2>&1
  docker rm -f "$POSTGRES_CONTAINER" >/dev/null 2>&1
  if [ -d "$KEYS_DIR" ]; then
    sudo find "$KEYS_DIR" -mindepth 1 -maxdepth 1 -delete >/dev/null 2>&1 || true
  fi
  if [ -d "$WORK_DIR" ]; then
    find "$WORK_DIR" -depth -delete >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

json_result() {
  jq -cer 'if .error then error(.error | tostring) elif has("result") then .result else error("missing result") end'
}

wait_json_url() {
  local label="$1"
  local url="$2"
  local attempts="${3:-180}"
  for _ in $(seq 1 "$attempts"); do
    if body="$(curl --fail --silent --show-error --max-time 10 "$url" 2>/dev/null)"       && jq -e . >/dev/null 2>&1 <<<"$body"; then
      echo "[ok] $label"
      return 0
    fi
    sleep 1
  done
  fail "$label did not become ready: $url"
}

wait_rpc() {
  local url="$1"
  for _ in $(seq 1 240); do
    body="$(curl --silent --show-error --max-time 10       -H 'Content-Type: application/json'       --data '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":[]}'       "$url" 2>/dev/null || true)"
    if [ "$(jq -r '.result // empty' <<<"$body" 2>/dev/null)" = "ok" ]; then
      echo "[ok] Validator JSON-RPC is healthy"
      return 0
    fi
    sleep 1
  done
  fail "Validator JSON-RPC did not become healthy: $url"
}

rpc_call() {
  local method="$1"
  local params="${2:-[]}"
  jq -cn --arg method "$method" --argjson params "$params"     '{jsonrpc:"2.0",id:1,method:$method,params:$params}' |
    curl --fail-with-body --silent --show-error --max-time 20       -H 'Content-Type: application/json' --data-binary @- "$RPC_URL"
}

rpc_result() {
  rpc_call "$1" "${2:-[]}" | json_result
}

balance() {
  rpc_result getBalance "$(jq -cn --arg address "$1" '[ $address, {commitment:"confirmed"} ]')" |
    jq -er 'if type == "object" then .value else . end'
}

wait_balance_at_least() {
  local address="$1"
  local minimum="$2"
  local label="$3"
  local last=0
  for _ in $(seq 1 120); do
    last="$(balance "$address" 2>/dev/null || echo 0)"
    if [ "$last" -ge "$minimum" ]; then
      echo "[ok] $label: $last lamports"
      return 0
    fi
    sleep 1
  done
  fail "$label did not reach $minimum lamports; last=$last"
}

api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local admin="${4:-0}"
  local request_id="${5:-}"
  local args=(--fail-with-body --silent --show-error --max-time 30 -X "$method" -H 'Accept: application/json')
  if [ "$admin" = "1" ]; then
    args+=(-H "x-aeko-settings-token: $AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN")
  fi
  if [ -n "$request_id" ]; then
    args+=(-H "x-request-id: $request_id")
  fi
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' --data "$body")
  fi
  curl "${args[@]}" "$EXPLORER_API_URL$path"
}

api_data() {
  api_request "$@" | jq -cer 'if has("data") then .data else error("missing data envelope") end'
}

wait_public_funding_confirmed() {
  local request_id="$1"
  local last=""
  local status=""
  for _ in $(seq 1 120); do
    last="$(api_data GET "/funding/request/$request_id" 2>/dev/null || true)"
    status="$(jq -r '.status // empty' <<<"$last" 2>/dev/null)"
    case "$status" in
      confirmed)
        jq -c . <<<"$last"
        return 0
        ;;
      failed|rejected)
        fail "public Funding request $request_id ended in $status: $last"
        ;;
    esac
    sleep 1
  done
  fail "public Funding request $request_id did not confirm; last=$last"
}

wait_admin_request_confirmed() {
  local request_id="$1"
  local last=""
  local status=""
  for _ in $(seq 1 120); do
    last="$(api_data GET "/admin/funding/requests/$request_id" "" 1 2>/dev/null || true)"
    status="$(jq -r '.status // empty' <<<"$last" 2>/dev/null)"
    case "$status" in
      confirmed)
        jq -c . <<<"$last"
        return 0
        ;;
      failed|rejected)
        fail "Admin Funding request $request_id ended in $status: $last"
        ;;
    esac
    sleep 1
  done
  fail "Admin Funding request $request_id did not confirm; last=$last"
}

echo "==> Verifying the exact Linux CLI release artifact"
test -s "$CLI_ARCHIVE" || fail "CLI archive not found: $CLI_ARCHIVE"
checksum_file="${CLI_ARCHIVE}.sha256"
if [ -s "$checksum_file" ]; then
  (
    cd "$(dirname "$CLI_ARCHIVE")"
    sha256sum -c "$(basename "$checksum_file")"
  )
fi
tar -xzf "$CLI_ARCHIVE" -C "$CLI_DIR"
chmod 0755 "$CLI_DIR/aeko" "$CLI_DIR/aeko-keygen"
"$CLI_DIR/aeko" --version | tee "$ARTIFACT_DIR/cli-version.txt"
"$CLI_DIR/aeko-keygen" --version | tee "$ARTIFACT_DIR/keygen-version.txt"

echo "==> Verifying immutable runtime images loaded from the producer workflow"
for image in aeko-tools aeko-validator aeko-faucet aeko-social-bootstrap aeko-protocol-bootstrap aeko-explorer-api
do
  ref="${IMAGE_REPOSITORY}/${image}:${IMAGE_TAG}"
  docker image inspect "$ref" >/dev/null
  printf '%s %s\n' "$ref" "$(docker image inspect -f '{{.Id}}' "$ref")" >>"$ARTIFACT_DIR/runtime-images.txt"
done

echo "==> Preparing production Coolify Compose topology"
sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$KEYS_DIR"
sudo find "$KEYS_DIR" -mindepth 1 -maxdepth 1 -delete
compose config >"$ARTIFACT_DIR/compose-rendered.yml"

compose create --pull never key-bootstrap >/dev/null
COMPOSE_NETWORK="${PROJECT}_aeko"
docker network inspect "$COMPOSE_NETWORK" >/dev/null

if [ "$CONTRACT_SCOPE" != "chain" ]; then
docker run -d --name "$POSTGRES_CONTAINER"   --network "$COMPOSE_NETWORK" --network-alias postgres   -e POSTGRES_USER=aeko -e POSTGRES_PASSWORD=aeko -e POSTGRES_DB=aeko_explorer   postgres:16-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U aeko -d aeko_explorer >/dev/null 2>&1; then
    echo "[ok] external PostgreSQL sidecar is ready"
    break
  fi
  sleep 1
done
docker exec "$POSTGRES_CONTAINER" pg_isready -U aeko -d aeko_explorer >/dev/null   || fail "PostgreSQL sidecar never became ready"
fi

echo "==> Starting production network/API services (UI intentionally excluded)"
compose up --pull never -d key-bootstrap faucet validator social-bootstrap protocol-bootstrap

for service in key-bootstrap social-bootstrap protocol-bootstrap; do
  cid="$(compose ps -a -q "$service")"
  test -n "$cid" || fail "$service container was not created"
  code="$(docker wait "$cid")"
  if [ "$code" != "0" ]; then
    compose logs --no-color "$service" >&2 || true
    fail "$service exited with code $code"
  fi
  echo "[ok] $service completed successfully"
done

if [ "$CONTRACT_SCOPE" != "chain" ]; then
  compose up --pull never -d explorer-api
fi

service_ip() {
  local service="$1"
  local cid
  cid="$(compose ps -q "$service")"
  test -n "$cid" || fail "$service container is not running"
  docker inspect -f "{{with index .NetworkSettings.Networks \"$COMPOSE_NETWORK\"}}{{.IPAddress}}{{end}}" "$cid"
}

VALIDATOR_IP="$(service_ip validator)"
test -n "$VALIDATOR_IP" || fail "Validator container IP is empty"
RPC_URL="http://${VALIDATOR_IP}:8899"
WS_HOST="$VALIDATOR_IP"
export RPC_URL

wait_rpc "$RPC_URL"

if [ "$CONTRACT_SCOPE" != "chain" ]; then
  EXPLORER_IP="$(service_ip explorer-api)"
  test -n "$EXPLORER_IP" || fail "Explorer API container IP is empty"
  EXPLORER_API_URL="http://${EXPLORER_IP}:8088"
  export EXPLORER_API_URL
  wait_json_url "Explorer API liveness" "$EXPLORER_API_URL/"
  wait_json_url "Explorer API strict readiness" "$EXPLORER_API_URL/health" 240
fi

echo "==> Generating dedicated runtime smoke wallets with the exact release keygen"
generate_smoke_key() {
  local name="$1"
  "$CLI_DIR/aeko-keygen" new --no-bip39-passphrase --silent --outfile "$SMOKE_KEYS/$name.json" >/dev/null
  "$CLI_DIR/aeko-keygen" pubkey "$SMOKE_KEYS/$name.json"
}
PUBLIC_ADDRESS="$(generate_smoke_key public-funding)"
ADMIN_ADDRESS="$(generate_smoke_key admin-funding)"
RPC_AIRDROP_ADDRESS="$(generate_smoke_key rpc-airdrop)"
API_AIRDROP_ADDRESS="$(generate_smoke_key api-airdrop)"
RPC_FUNDING_ADDRESS="$(generate_smoke_key rpc-funding)"
CLI_SENDER_ADDRESS="$(generate_smoke_key cli-sender)"
CLI_RECIPIENT_ADDRESS="$(generate_smoke_key cli-recipient)"
export PUBLIC_ADDRESS ADMIN_ADDRESS RPC_AIRDROP_ADDRESS API_AIRDROP_ADDRESS RPC_FUNDING_ADDRESS CLI_SENDER_ADDRESS CLI_RECIPIENT_ADDRESS

echo "==> Exercising critical JSON-RPC semantics with curl"
test "$(rpc_result getHealth | jq -r '.')" = "ok" || fail "getHealth != ok"
rpc_result getVersion >"$ARTIFACT_DIR/rpc-getVersion.json"
GENESIS_HASH="$(rpc_result getGenesisHash | jq -r '.')"
SLOT_ONE="$(rpc_result getSlot '[{"commitment":"confirmed"}]' | jq -r '.')"
sleep 2
SLOT_TWO="$(rpc_result getSlot '[{"commitment":"confirmed"}]' | jq -r '.')"
[ "$SLOT_TWO" -ge "$SLOT_ONE" ] || fail "slot regressed: $SLOT_ONE -> $SLOT_TWO"
rpc_result getBlockHeight '[{"commitment":"confirmed"}]' >"$ARTIFACT_DIR/rpc-getBlockHeight.json"
rpc_result getEpochInfo '[{"commitment":"confirmed"}]' >"$ARTIFACT_DIR/rpc-getEpochInfo.json"
rpc_result getLatestBlockhash '[{"commitment":"confirmed"}]' >"$ARTIFACT_DIR/rpc-getLatestBlockhash.json"
rpc_result getClusterNodes >"$ARTIFACT_DIR/rpc-getClusterNodes.json"
rpc_result getTransactionCount '[{"commitment":"confirmed"}]' >"$ARTIFACT_DIR/rpc-getTransactionCount.json"
rpc_result getSupply '[{"commitment":"confirmed"}]' >"$ARTIFACT_DIR/rpc-getSupply.json"
rpc_result getBalance "$(jq -cn --arg a "$RPC_FUNDING_ADDRESS" '[ $a, {commitment:"confirmed"} ]')" >"$ARTIFACT_DIR/rpc-getBalance.json"
echo "[ok] core RPC reads respond; genesis=$GENESIS_HASH slot=$SLOT_ONE->$SLOT_TWO"

unauthorized="$(rpc_call requestFunding "$(jq -cn --arg a "$RPC_FUNDING_ADDRESS" '[ $a, 1000000000 ]')")"
test "$(jq -r '.error.code // empty' <<<"$unauthorized")" = "-32600"   || fail "unauthenticated requestFunding was not rejected: $unauthorized"
echo "[ok] requestFunding requires the settlement credential"

funding_params="$(jq -cn --arg a "$RPC_FUNDING_ADDRESS" --arg key "$AEKO_FUNDING_AUTHORIZATION_KEY"   '[ $a, 1000000000, {fundingAuthorization:$key, commitment:"confirmed"} ]')"
RPC_FUNDING_SIGNATURE="$(rpc_result requestFunding "$funding_params" | jq -r '.')"
test -n "$RPC_FUNDING_SIGNATURE" || fail "authorized requestFunding returned no signature"
wait_balance_at_least "$RPC_FUNDING_ADDRESS" 1000000000 "protected RPC Funding reached wallet"

airdrop_params="$(jq -cn --arg a "$RPC_AIRDROP_ADDRESS" '[ $a, 1000000000, {commitment:"confirmed"} ]')"
RPC_AIRDROP_SIGNATURE="$(rpc_result requestAirdrop "$airdrop_params" | jq -r '.')"
test -n "$RPC_AIRDROP_SIGNATURE" || fail "requestAirdrop returned no signature"
wait_balance_at_least "$RPC_AIRDROP_ADDRESS" 1000000000 "developer RPC airdrop reached wallet"

rpc_result getSignatureStatuses "$(jq -cn --arg s "$RPC_FUNDING_SIGNATURE" '[[ $s ], {searchTransactionHistory:true}]')" >"$ARTIFACT_DIR/rpc-signature-status.json"
rpc_result getAccountInfo "$(jq -cn --arg a "$RPC_FUNDING_ADDRESS" '[ $a, {commitment:"confirmed",encoding:"base64"} ]')" >"$ARTIFACT_DIR/rpc-account-info.json"

echo "==> Auditing every HTTP JSON-RPC method declared by the running source"
python3 - "$ARTIFACT_DIR/rpc-methods.txt" <<'PY'
import re
import sys
from pathlib import Path

text = Path("rpc/src/rpc.rs").read_text(encoding="utf-8")
text = text.split("pub mod rpc_obsolete_v1_7", 1)[0]
methods = sorted(set(re.findall(
    r'#\[\s*rpc\([^\]]*?name\s*=\s*"([^"]+)"[^\]]*\)\s*\]',
    text,
    flags=re.DOTALL,
)))
if not methods:
    raise SystemExit("no JSON-RPC methods discovered")
Path(sys.argv[1]).write_text("\n".join(methods) + "\n", encoding="utf-8")
print(f"discovered {len(methods)} JSON-RPC methods")
PY

RPC_METHOD_COUNT=0
while IFS= read -r method; do
  test -n "$method" || continue
  RPC_METHOD_COUNT=$((RPC_METHOD_COUNT + 1))
  response="$(rpc_call "$method" '[]' 2>/dev/null || true)"
  test -n "$response" || fail "RPC method $method did not answer"
  code="$(jq -r '.error.code // empty' <<<"$response" 2>/dev/null)"
  if [ "$code" = "-32601" ]; then
    fail "RPC method declared in rpc/src/rpc.rs is not registered at runtime: $method"
  fi
done <"$ARTIFACT_DIR/rpc-methods.txt"
echo "[ok] all $RPC_METHOD_COUNT declared JSON-RPC methods are registered"

if [ "$CONTRACT_SCOPE" != "chain" ]; then
echo "==> Exercising Explorer API and Funding end-to-end with curl"
for path in / /health /readiness /overview /network/readiness /registry /registry/social   /registry/protocol /protocol/status /social/status '/posts?limit=1' '/engagement?limit=1'   '/stakes?limit=1' '/rewards?limit=1' '/blocks?limit=1' '/transactions?limit=1'   '/tokens/transfers?limit=1' '/nfts?limit=1' /settings
do
  body="$(api_request GET "$path")"
  jq -e . >/dev/null <<<"$body" || fail "Explorer GET $path did not return JSON"
  echo "[ok] Explorer GET $path"
done

settings="$(api_data GET /settings)"
settings_revision="$(jq -r '.revision' <<<"$settings")"
network_tools_enabled="$(jq -r '.application.networkToolsEnabled' <<<"$settings")"
api_data PATCH /settings "$(jq -cn --argjson r "$settings_revision" --argjson value "$network_tools_enabled"   '{expectedRevision:$r,networkToolsEnabled:$value}')" 1 >"$ARTIFACT_DIR/settings-patch.json"
echo "[ok] Explorer settings authenticated PATCH contract"

funding_settings="$(api_data GET /admin/funding/settings "" 1)"
funding_revision="$(jq -r '.settings.revision' <<<"$funding_settings")"
funding_enabled="$(jq -r '.settings.enabled' <<<"$funding_settings")"
api_data PATCH /admin/funding/settings "$(jq -cn --argjson r "$funding_revision" --argjson value "$funding_enabled"   '{expectedRevision:$r,enabled:$value}')" 1 >"$ARTIFACT_DIR/funding-settings-patch.json"
echo "[ok] Funding settings authenticated PATCH contract"

PUBLIC_BEFORE="$(balance "$PUBLIC_ADDRESS")"
public_body="$WORK_DIR/public-request.json"
public_status="$(curl --silent --show-error --max-time 30 -o "$public_body" -w '%{http_code}'   -H 'Accept: application/json' -H 'Content-Type: application/json'   --data "$(jq -cn --arg a "$PUBLIC_ADDRESS" '{address:$a}')"   "$EXPLORER_API_URL/funding/request")"
test "$public_status" = "202" || { cat "$public_body" >&2; fail "public Funding request expected HTTP 202, got $public_status"; }
PUBLIC_REQUEST_ID="$(jq -er '.data.id' "$public_body")"
test "$(jq -r '.data.status' "$public_body")" = "pending" || fail "public Funding did not start pending"
sleep 1
PUBLIC_AFTER_REQUEST="$(balance "$PUBLIC_ADDRESS")"
test "$PUBLIC_AFTER_REQUEST" = "$PUBLIC_BEFORE" || fail "public Funding transferred before Admin approval"
echo "[ok] public Funding is approval-gated"

approved="$(api_data POST "/admin/funding/requests/$PUBLIC_REQUEST_ID/decide" '{"approved":true}' 1)"
case "$(jq -r '.status' <<<"$approved")" in processing|submitted|confirmed) ;; *) fail "Admin approval returned unexpected state: $approved" ;; esac
confirmed_public="$(wait_public_funding_confirmed "$PUBLIC_REQUEST_ID")"
PUBLIC_SIGNATURE="$(jq -r '.signature // empty' <<<"$confirmed_public")"
test -n "$PUBLIC_SIGNATURE" || fail "confirmed public Funding has no signature"
wait_balance_at_least "$PUBLIC_ADDRESS" $((PUBLIC_BEFORE + 1000000000)) "approved public Funding reached wallet"
api_data POST "/admin/funding/requests/$PUBLIC_REQUEST_ID/reconcile" "" 1 >"$ARTIFACT_DIR/public-funding-reconcile.json"
echo "[ok] public Funding approval/reconciliation is durable"

ADMIN_BEFORE="$(balance "$ADMIN_ADDRESS")"
ADMIN_IDEMPOTENCY_KEY="ci-direct-admin-funding-0001"
ADMIN_FUNDING_BODY="$(jq -cn --arg a "$ADMIN_ADDRESS" '{address:$a,amountAeko:2}')"
direct="$(api_data POST /admin/funding/send "$ADMIN_FUNDING_BODY" 1 "$ADMIN_IDEMPOTENCY_KEY")"
ADMIN_REQUEST_ID="$(jq -er '.id' <<<"$direct")"
test "$(jq -r '.source' <<<"$direct")" = "admin" || fail "direct Admin Funding source is not admin"
case "$(jq -r '.status' <<<"$direct")" in processing|submitted|confirmed) ;; *) fail "direct Admin Funding returned unexpected state: $direct" ;; esac
confirmed_admin="$(wait_admin_request_confirmed "$ADMIN_REQUEST_ID")"
ADMIN_SIGNATURE="$(jq -r '.signature // empty' <<<"$confirmed_admin")"
test -n "$ADMIN_SIGNATURE" || fail "direct Admin Funding has no signature"
wait_balance_at_least "$ADMIN_ADDRESS" $((ADMIN_BEFORE + 2000000000)) "direct Admin Funding reached wallet without second approval"
ADMIN_AFTER_FIRST="$(balance "$ADMIN_ADDRESS")"

replayed_direct="$(api_data POST /admin/funding/send "$ADMIN_FUNDING_BODY" 1 "$ADMIN_IDEMPOTENCY_KEY")"
test "$(jq -r '.id' <<<"$replayed_direct")" = "$ADMIN_REQUEST_ID" || fail "idempotent Admin retry created a second request: $replayed_direct"
test "$(jq -r '.signature // empty' <<<"$replayed_direct")" = "$ADMIN_SIGNATURE" || fail "idempotent Admin retry changed the durable signature"
sleep 1
ADMIN_AFTER_REPLAY="$(balance "$ADMIN_ADDRESS")"
test "$ADMIN_AFTER_REPLAY" = "$ADMIN_AFTER_FIRST" || fail "idempotent Admin retry changed wallet balance twice"
echo "[ok] direct Admin Funding has no second approval step and repeated X-Request-Id is idempotent"

AIR_BEFORE="$(balance "$API_AIRDROP_ADDRESS")"
airdrop="$(api_data POST /funding/airdrop "$(jq -cn --arg a "$API_AIRDROP_ADDRESS" '{address:$a,amountAeko:1}')")"
API_AIRDROP_SIGNATURE="$(jq -r '.signature // empty' <<<"$airdrop")"
test -n "$API_AIRDROP_SIGNATURE" || fail "Explorer developer airdrop returned no signature"
wait_balance_at_least "$API_AIRDROP_ADDRESS" $((AIR_BEFORE + 1000000000)) "Explorer developer airdrop reached wallet"

funding_history="$(api_data GET '/admin/funding/history?limit=100' "" 1)"
airdrop_history="$(api_data GET '/admin/funding/airdrops?limit=100' "" 1)"
jq -e --arg sig "$PUBLIC_SIGNATURE" 'any(.[]; .signature == $sig and .confirmed == true)' <<<"$funding_history" >/dev/null   || fail "public Funding missing from Funding history"
jq -e --arg sig "$ADMIN_SIGNATURE" 'any(.[]; .signature == $sig and .confirmed == true)' <<<"$funding_history" >/dev/null   || fail "direct Admin Funding missing from Funding history"
jq -e --arg sig "$API_AIRDROP_SIGNATURE" 'any(.[]; .signature == $sig)' <<<"$airdrop_history" >/dev/null   || fail "developer airdrop missing from airdrop history"
jq -e --arg sig "$API_AIRDROP_SIGNATURE" 'all(.[]; .signature != $sig)' <<<"$funding_history" >/dev/null   || fail "developer airdrop leaked into Funding history"
echo "[ok] Funding and developer-airdrop histories remain distinct"

echo "==> Runtime-auditing every Explorer API route declared by feature routers"
python3 - "$ARTIFACT_DIR/explorer-routes.tsv" <<'PY'
import re
import sys
from pathlib import Path

route_pattern = re.compile(
    r'\.route\(\s*"([^"]+)"\s*,\s*'
    r'((?:get|post|patch|put|delete)\([A-Za-z0-9_]+\)'
    r'(?:\.(?:get|post|patch|put|delete)\([A-Za-z0-9_]+\))*)\s*\)',
    flags=re.DOTALL,
)
rows = set()
for path in Path("apps/explorer/backend/src/features").rglob("*.rs"):
    text = path.read_text(encoding="utf-8")
    for route, chain in route_pattern.findall(text):
        for verb in re.findall(r'(get|post|patch|put|delete)\(', chain):
            rows.add((verb.upper(), route))
if not rows:
    raise SystemExit("no Explorer routes discovered")
with Path(sys.argv[1]).open("w", encoding="utf-8") as handle:
    for verb, route in sorted(rows):
        handle.write(f"{verb}\t{route}\n")
print(f"discovered {len(rows)} Explorer method/path contracts")
PY

API_ROUTE_COUNT=0
while IFS=$'\t' read -r method path; do
  test -n "$method" || continue
  API_ROUTE_COUNT=$((API_ROUTE_COUNT + 1))
  case "$method $path" in
    "POST /funding/request"|"POST /funding/airdrop"|"POST /admin/funding/requests/:id/decide"|"POST /admin/funding/requests/:id/reconcile"|"POST /admin/funding/send"|"PATCH /settings"|"PATCH /admin/funding/settings")
      continue
      ;;
    POST*|PATCH*|PUT*|DELETE*)
      fail "new mutating Explorer route lacks an explicit production contract probe: $method $path"
      ;;
  esac

  probe="$path"
  probe="${probe//:slot/$SLOT_TWO}"
  probe="${probe//:address/$ADMIN_ADDRESS}"
  probe="${probe//:signature/$PUBLIC_SIGNATURE}"
  probe="${probe//:mint/$ADMIN_ADDRESS}"
  probe="${probe//:token_id/$ADMIN_ADDRESS}"
  probe="${probe//:post_id/ci-missing-post}"
  probe="${probe//:id/$PUBLIC_REQUEST_ID}"
  [ "$probe" = "/search" ] && probe="/search?q=$ADMIN_ADDRESS"

  tmp="$WORK_DIR/api-route.json"
  args=(--silent --show-error --max-time 20 -o "$tmp" -w '%{http_code}' -H 'Accept: application/json')
  if [[ "$path" == /admin/* ]]; then
    args+=(-H "x-aeko-settings-token: $AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN")
  fi
  status="$(curl "${args[@]}" "$EXPLORER_API_URL$probe" || true)"
  test -n "$status" || fail "Explorer $method $path did not answer"
  [ "$status" -lt 500 ] || { cat "$tmp" >&2 || true; fail "Explorer $method $path returned HTTP $status"; }
  jq -e . "$tmp" >/dev/null 2>&1 || { cat "$tmp" >&2 || true; fail "Explorer $method $path returned non-JSON HTTP $status"; }
done <"$ARTIFACT_DIR/explorer-routes.tsv"
echo "[ok] all $API_ROUTE_COUNT declared Explorer API method/path contracts are represented at runtime"

echo "==> Exercising the exact Linux CLI release against the running production topology"
"$CLI_DIR/aeko" --url "$RPC_URL" cluster-version | tee "$ARTIFACT_DIR/cli-cluster-version.txt"
"$CLI_DIR/aeko" --url "$RPC_URL" balance "$ADMIN_ADDRESS" | tee "$ARTIFACT_DIR/cli-balance.txt"

CLI_SENDER_BEFORE="$(balance "$CLI_SENDER_ADDRESS")"
cli_funding="$(api_data POST /admin/funding/send "$(jq -cn --arg a "$CLI_SENDER_ADDRESS" '{address:$a,amountAeko:2}')" 1)"
CLI_FUNDING_ID="$(jq -er '.id' <<<"$cli_funding")"
wait_admin_request_confirmed "$CLI_FUNDING_ID" >/dev/null
wait_balance_at_least "$CLI_SENDER_ADDRESS" $((CLI_SENDER_BEFORE + 2000000000)) "CLI sender funded"

"$CLI_DIR/aeko" --url "$RPC_URL" --keypair "$SMOKE_KEYS/cli-sender.json"   transfer --allow-unfunded-recipient "$CLI_RECIPIENT_ADDRESS" 0.5   | tee "$ARTIFACT_DIR/cli-transfer.txt"
wait_balance_at_least "$CLI_RECIPIENT_ADDRESS" 500000000 "release CLI transfer reached recipient"
echo "[ok] exact release CLI can query and submit to the runtime network"

fi

if [ "$CONTRACT_SCOPE" != "application" ]; then
  echo "==> Exercising all declared WebSocket subscriptions"
  python3 scripts/ci-rpc-ws-contract.py --host "$WS_HOST" --port 8900 --account "$PUBLIC_ADDRESS" --signature "$PUBLIC_SIGNATURE" --manifest "$ARTIFACT_DIR/ws-methods.txt"
fi

if [ "$CONTRACT_SCOPE" != "chain" ]; then
  echo "==> Running deeper non-UI Social and Protocol integration checks"
  AEKO_RPC_URL="$RPC_URL" AEKO_EXPLORER_API_URL="$EXPLORER_API_URL" python3 scripts/smoke-aeko-social.py
  AEKO_RPC_URL="$RPC_URL" AEKO_EXPLORER_API_URL="$EXPLORER_API_URL" python3 scripts/smoke-aeko-protocol.py
fi

capture_diagnostics
echo "[PASS] production Coolify runtime contract scope $CONTRACT_SCOPE passed"
