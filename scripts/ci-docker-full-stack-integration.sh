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
  chain|rpc-methods|application|protocol|full) ;;
  *) echo "Unsupported AEKO_CI_CONTRACT_SCOPE: $CONTRACT_SCOPE" >&2; exit 2 ;;
esac
APPLICATION_FLOW="${AEKO_CI_APPLICATION_FLOW:-all}"
case "$APPLICATION_FLOW" in
  all|route-surface|settings|funding-public|funding-admin|funding-airdrop|social-protocol) ;;
  *) echo "Unsupported AEKO_CI_APPLICATION_FLOW: $APPLICATION_FLOW" >&2; exit 2 ;;
esac
NEEDS_EXPLORER=0
case "$CONTRACT_SCOPE" in application|protocol|full) NEEDS_EXPLORER=1 ;; esac
application_flow_enabled() { [ "$APPLICATION_FLOW" = "all" ] || [ "$APPLICATION_FLOW" = "$1" ]; }
summary_append() { if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$*" >> "$GITHUB_STEP_SUMMARY"; fi; }
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

if [ "$NEEDS_EXPLORER" = "1" ]; then
docker run -d --name "$POSTGRES_CONTAINER"   --network "$COMPOSE_NETWORK" --network-alias postgres   -e POSTGRES_USER=aeko -e POSTGRES_PASSWORD=aeko -e POSTGRES_DB=aeko_explorer   postgres:16-alpine >/dev/null
postgres_ready=0
for _ in $(seq 1 60); do
  if result="$(docker exec "$POSTGRES_CONTAINER" psql -U aeko -d aeko_explorer -Atqc 'SELECT 1' 2>/dev/null)" && [ "$result" = "1" ]; then
    postgres_ready=1
    echo "[ok] external PostgreSQL sidecar is ready"
    break
  fi
  sleep 1
done
[ "$postgres_ready" = "1" ] || fail "PostgreSQL sidecar never became ready with the aeko_explorer database"
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

if [ "$NEEDS_EXPLORER" = "1" ]; then
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

if [ "$NEEDS_EXPLORER" = "1" ]; then
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

if [ "$CONTRACT_SCOPE" = "chain" ] || [ "$CONTRACT_SCOPE" = "full" ]; then
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


fi
if [ "$CONTRACT_SCOPE" = "rpc-methods" ] || [ "$CONTRACT_SCOPE" = "full" ]; then
RPC_FUNCTIONAL_RESULTS="$ARTIFACT_DIR/rpc-functional-results.jsonl"; : > "$RPC_FUNCTIONAL_RESULTS"; RPC_FUNCTIONAL_FAILURES=0
summary_append "## Functional JSON-RPC probes"; summary_append "| Method | Result | Detail |"; summary_append "| --- | --- | --- |"
strict_rpc_probe() {
  local method="$1"; local params="${2:-[]}"; local response detail
  if ! response="$(rpc_call "$method" "$params" 2>&1)"; then detail="transport failure"
  elif ! jq -e . >/dev/null 2>&1 <<<"$response"; then detail="non-JSON response"
  elif ! jq -e 'has("result") and (has("error") | not)' >/dev/null 2>&1 <<<"$response"; then detail="$(jq -cr '.error // "missing result"' <<<"$response")"
  else
    detail="returned result"
    jq -cn --arg method "$method" --arg outcome PASS --arg detail "$detail" '{method:$method,outcome:$outcome,detail:$detail}' >> "$RPC_FUNCTIONAL_RESULTS"
    summary_append "| $method | PASS | $detail |"; return 0
  fi
  jq -cn --arg method "$method" --arg outcome FAIL --arg detail "$detail" '{method:$method,outcome:$outcome,detail:$detail}' >> "$RPC_FUNCTIONAL_RESULTS"
  summary_append "| $method | FAIL | $detail |"; return 1
}
strict_rpc_probe getHealth || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getVersion || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getGenesisHash || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getSlot '[{"commitment":"confirmed"}]' || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getBlockHeight '[{"commitment":"confirmed"}]' || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getEpochInfo '[{"commitment":"confirmed"}]' || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getLatestBlockhash '[{"commitment":"confirmed"}]' || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getClusterNodes || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getTransactionCount '[{"commitment":"confirmed"}]' || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getSupply '[{"commitment":"confirmed"}]' || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getBalance "$(jq -cn --arg a "$RPC_FUNDING_ADDRESS" '[$a,{commitment:"confirmed"}]')" || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
strict_rpc_probe getAccountInfo "$(jq -cn --arg a "$RPC_FUNDING_ADDRESS" '[$a,{commitment:"confirmed",encoding:"base64"}]')" || RPC_FUNCTIONAL_FAILURES=$((RPC_FUNCTIONAL_FAILURES+1))
jq -s . "$RPC_FUNCTIONAL_RESULTS" > "$ARTIFACT_DIR/rpc-functional-results.json"

python3 - "$ARTIFACT_DIR/rpc-methods.txt" <<'PY'
import re,sys
from pathlib import Path
text=Path("rpc/src/rpc.rs").read_text(encoding="utf-8").split("pub mod rpc_obsolete_v1_7",1)[0]
methods=sorted(set(re.findall(r'#\[\s*rpc\([^\]]*?name\s*=\s*"([^"]+)"[^\]]*\)\s*\]',text,flags=re.DOTALL)))
if not methods: raise SystemExit("no JSON-RPC methods discovered")
Path(sys.argv[1]).write_text("\n".join(methods)+"\n",encoding="utf-8")
PY
RPC_METHOD_RESULTS="$ARTIFACT_DIR/rpc-method-results.jsonl"; : > "$RPC_METHOD_RESULTS"; RPC_METHOD_COUNT=0; RPC_METHOD_FAILURES=0
summary_append "## Declared JSON-RPC surface"; summary_append "| Method | Result | Classification | RPC code |"; summary_append "| --- | --- | --- | --- |"
while IFS= read -r method; do
  test -n "$method" || continue; RPC_METHOD_COUNT=$((RPC_METHOD_COUNT+1))
  response="$(rpc_call "$method" '[]' 2>/dev/null || true)"; outcome=PASS; classification=returned-result; code=""
  if [ -z "$response" ]; then outcome=FAIL; classification=no-response
  elif ! jq -e . >/dev/null 2>&1 <<<"$response"; then outcome=FAIL; classification=non-json
  elif jq -e 'has("result")' >/dev/null 2>&1 <<<"$response"; then classification=returned-result
  else
    code="$(jq -r '.error.code // empty' <<<"$response")"
    case "$code" in -32601) outcome=FAIL; classification=method-not-registered ;; -32603) outcome=FAIL; classification=internal-error ;; -32600|-32602) classification=parameter-validation ;; *) classification=rpc-domain-error ;; esac
  fi
  [ "$outcome" = PASS ] || RPC_METHOD_FAILURES=$((RPC_METHOD_FAILURES+1))
  jq -cn --arg method "$method" --arg outcome "$outcome" --arg classification "$classification" --arg rpcCode "$code" '{method:$method,outcome:$outcome,classification:$classification,rpcCode:(if $rpcCode=="" then null else $rpcCode end)}' >> "$RPC_METHOD_RESULTS"
  summary_append "| $method | $outcome | $classification | ${code:--} |"
done < "$ARTIFACT_DIR/rpc-methods.txt"
jq -s . "$RPC_METHOD_RESULTS" > "$ARTIFACT_DIR/rpc-method-results.json"
[ "$RPC_METHOD_FAILURES" -eq 0 ] || fail "$RPC_METHOD_FAILURES declared JSON-RPC methods failed individual calls"
[ "$RPC_FUNCTIONAL_FAILURES" -eq 0 ] || fail "$RPC_FUNCTIONAL_FAILURES strict JSON-RPC probes failed"
fi

if [ "$CONTRACT_SCOPE" = application ] || [ "$CONTRACT_SCOPE" = full ]; then
SLOT_TWO="$(rpc_result getSlot '[{"commitment":"confirmed"}]' | jq -r '.')"

if application_flow_enabled route-surface; then
python3 - "$ARTIFACT_DIR/explorer-routes.tsv" <<'PY'
import re,sys
from pathlib import Path
p=re.compile(r'\.route\(\s*"([^"]+)"\s*,\s*((?:get|post|patch|put|delete)\([A-Za-z0-9_]+\)(?:\.(?:get|post|patch|put|delete)\([A-Za-z0-9_]+\))*)\s*\)',re.DOTALL)
rows=set()
for f in Path("apps/explorer/backend/src/features").rglob("*.rs"):
    t=f.read_text(encoding="utf-8")
    for route,chain in p.findall(t):
        for verb in re.findall(r'(get|post|patch|put|delete)\(',chain): rows.add((verb.upper(),route))
if not rows: raise SystemExit("no Explorer routes discovered")
with Path(sys.argv[1]).open("w",encoding="utf-8") as h:
    for verb,route in sorted(rows): h.write(f"{verb}\t{route}\n")
PY
API_ROUTE_RESULTS="$ARTIFACT_DIR/explorer-route-results.jsonl"; : > "$API_ROUTE_RESULTS"; API_ROUTE_FAILURES=0; API_ROUTE_COUNT=0
summary_append "## Explorer backend route surface"; summary_append "| Method | Route | HTTP | Result | Coverage |"; summary_append "| --- | --- | ---: | --- | --- |"
while IFS=$'\t' read -r method path; do
  test -n "$method" || continue; API_ROUTE_COUNT=$((API_ROUTE_COUNT+1)); coverage=route-surface
  case "$method $path" in
    "PATCH /settings"|"PATCH /admin/funding/settings") coverage=settings ;;
    "POST /funding/request"|"POST /admin/funding/requests/:id/decide"|"POST /admin/funding/requests/:id/reconcile") coverage=funding-public ;;
    "POST /admin/funding/send") coverage=funding-admin ;;
    "POST /funding/airdrop") coverage=funding-airdrop ;;
    POST*|PATCH*|PUT*|DELETE*) API_ROUTE_FAILURES=$((API_ROUTE_FAILURES+1)); jq -cn --arg method "$method" --arg path "$path" '{method:$method,path:$path,outcome:"FAIL",coverage:"unmapped-mutation"}' >> "$API_ROUTE_RESULTS"; continue ;;
  esac
  if [ "$method" != GET ]; then jq -cn --arg method "$method" --arg path "$path" --arg coverage "$coverage" '{method:$method,path:$path,outcome:"PASS",coverage:$coverage}' >> "$API_ROUTE_RESULTS"; continue; fi
  probe="$path"; probe="${probe//:slot/$SLOT_TWO}"; probe="${probe//:address/$ADMIN_ADDRESS}"; probe="${probe//:signature/ci-missing-signature}"; probe="${probe//:mint/$ADMIN_ADDRESS}"; probe="${probe//:token_id/ci-missing-token}"; probe="${probe//:collection_id/ci-missing-collection}"; probe="${probe//:post_id/ci-missing-post}"; probe="${probe//:id/ci-missing-request}"
  [ "$probe" = /search ] && probe="/search?q=$ADMIN_ADDRESS"
  tmp="$WORK_DIR/api-route-$API_ROUTE_COUNT.json"; args=(--silent --show-error --max-time 20 -o "$tmp" -w '%{http_code}' -H 'Accept: application/json'); [[ "$path" == /admin/* ]] && args+=(-H "x-aeko-settings-token: $AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN")
  status="$(curl "${args[@]}" "$EXPLORER_API_URL$probe" || true)"; outcome=PASS; coverage=successful-read
  if [ -z "$status" ] || [ "$status" = 000 ]; then outcome=FAIL; coverage=no-response
  elif [ "$status" -ge 500 ]; then outcome=FAIL; coverage=server-error
  elif ! jq -e . "$tmp" >/dev/null 2>&1; then outcome=FAIL; coverage=non-json
  elif [ "$status" -ge 400 ]; then coverage=deterministic-client-error; fi
  [ "$outcome" = PASS ] || API_ROUTE_FAILURES=$((API_ROUTE_FAILURES+1))
  jq -cn --arg method "$method" --arg path "$path" --arg status "$status" --arg outcome "$outcome" --arg coverage "$coverage" '{method:$method,path:$path,httpStatus:($status|tonumber?),outcome:$outcome,coverage:$coverage}' >> "$API_ROUTE_RESULTS"
done < "$ARTIFACT_DIR/explorer-routes.tsv"
jq -s . "$API_ROUTE_RESULTS" > "$ARTIFACT_DIR/explorer-route-results.json"
[ "$API_ROUTE_FAILURES" -eq 0 ] || fail "$API_ROUTE_FAILURES Explorer routes failed runtime coverage"
fi

if application_flow_enabled settings; then
  settings="$(api_data GET /settings)"; rev="$(jq -r '.revision'<<<"$settings")"; val="$(jq -r '.application.networkToolsEnabled'<<<"$settings")"; api_data PATCH /settings "$(jq -cn --argjson r "$rev" --argjson v "$val" '{expectedRevision:$r,networkToolsEnabled:$v}')" 1 >"$ARTIFACT_DIR/settings-patch.json"
  fsettings="$(api_data GET /admin/funding/settings "" 1)"; frev="$(jq -r '.settings.revision'<<<"$fsettings")"; fval="$(jq -r '.settings.enabled'<<<"$fsettings")"; api_data PATCH /admin/funding/settings "$(jq -cn --argjson r "$frev" --argjson v "$fval" '{expectedRevision:$r,enabled:$v}')" 1 >"$ARTIFACT_DIR/funding-settings-patch.json"
  summary_append "## Backend flow: settings"; summary_append "- PASS: read + authenticated PATCH contracts"
fi

if application_flow_enabled funding-public; then
  api_data GET /funding/policy >"$ARTIFACT_DIR/funding-policy.json"; PUBLIC_BEFORE="$(balance "$PUBLIC_ADDRESS")"; body="$WORK_DIR/public-request.json"
  status="$(curl -sS --max-time 30 -o "$body" -w '%{http_code}' -H 'Accept: application/json' -H 'Content-Type: application/json' --data "$(jq -cn --arg a "$PUBLIC_ADDRESS" '{address:$a}')" "$EXPLORER_API_URL/funding/request")"; test "$status" = 202 || { cat "$body" >&2; fail "public Funding expected 202, got $status"; }
  PUBLIC_REQUEST_ID="$(jq -er '.data.id' "$body")"; test "$(jq -r '.data.status' "$body")" = pending || fail "public Funding did not start pending"; sleep 1; test "$(balance "$PUBLIC_ADDRESS")" = "$PUBLIC_BEFORE" || fail "public Funding transferred before approval"
  approved="$(api_data POST "/admin/funding/requests/$PUBLIC_REQUEST_ID/decide" '{"approved":true}' 1)"; case "$(jq -r '.status'<<<"$approved")" in processing|submitted|confirmed) ;; *) fail "unexpected approval state: $approved" ;; esac
  confirmed="$(wait_public_funding_confirmed "$PUBLIC_REQUEST_ID")"; PUBLIC_SIGNATURE="$(jq -r '.signature // empty'<<<"$confirmed")"; test -n "$PUBLIC_SIGNATURE" || fail "public Funding missing signature"; wait_balance_at_least "$PUBLIC_ADDRESS" $((PUBLIC_BEFORE+1000000000)) "approved public Funding reached wallet"
  api_data GET "/admin/funding/requests/$PUBLIC_REQUEST_ID" "" 1 >"$ARTIFACT_DIR/public-request-admin.json"; api_data POST "/admin/funding/requests/$PUBLIC_REQUEST_ID/reconcile" "" 1 >"$ARTIFACT_DIR/public-reconcile.json"
  hist="$(api_data GET '/admin/funding/history?limit=100' "" 1)"; jq -e --arg s "$PUBLIC_SIGNATURE" 'any(.[];.signature==$s and .confirmed==true)'<<<"$hist" >/dev/null || fail "public Funding missing from history"
  summary_append "## Backend flow: public Funding"; summary_append "- PASS: request -> approval -> confirmation -> reconcile -> history"
fi

if application_flow_enabled funding-admin; then
  ADMIN_BEFORE="$(balance "$ADMIN_ADDRESS")"; key=ci-direct-admin-funding-0001; payload="$(jq -cn --arg a "$ADMIN_ADDRESS" '{address:$a,amountAeko:2}')"; direct="$(api_data POST /admin/funding/send "$payload" 1 "$key")"; ADMIN_REQUEST_ID="$(jq -er '.id'<<<"$direct")"; test "$(jq -r '.source'<<<"$direct")" = admin || fail "admin funding source mismatch"
  confirmed="$(wait_admin_request_confirmed "$ADMIN_REQUEST_ID")"; ADMIN_SIGNATURE="$(jq -r '.signature // empty'<<<"$confirmed")"; test -n "$ADMIN_SIGNATURE" || fail "admin Funding missing signature"; wait_balance_at_least "$ADMIN_ADDRESS" $((ADMIN_BEFORE+2000000000)) "direct Admin Funding reached wallet"; after1="$(balance "$ADMIN_ADDRESS")"
  replay="$(api_data POST /admin/funding/send "$payload" 1 "$key")"; test "$(jq -r '.id'<<<"$replay")" = "$ADMIN_REQUEST_ID" || fail "idempotent retry changed request"; test "$(jq -r '.signature // empty'<<<"$replay")" = "$ADMIN_SIGNATURE" || fail "idempotent retry changed signature"; sleep 1; test "$(balance "$ADMIN_ADDRESS")" = "$after1" || fail "idempotent retry changed balance"
  hist="$(api_data GET '/admin/funding/history?limit=100' "" 1)"; jq -e --arg s "$ADMIN_SIGNATURE" 'any(.[];.signature==$s and .confirmed==true)'<<<"$hist" >/dev/null || fail "admin Funding missing from history"
  summary_append "## Backend flow: direct Admin Funding"; summary_append "- PASS: send -> confirmation -> idempotent replay -> history"
fi

if application_flow_enabled funding-airdrop; then
  AIR_BEFORE="$(balance "$API_AIRDROP_ADDRESS")"; a="$(api_data POST /funding/airdrop "$(jq -cn --arg a "$API_AIRDROP_ADDRESS" '{address:$a,amountAeko:1}')")"; API_AIRDROP_SIGNATURE="$(jq -r '.signature // empty'<<<"$a")"; test -n "$API_AIRDROP_SIGNATURE" || fail "airdrop missing signature"; wait_balance_at_least "$API_AIRDROP_ADDRESS" $((AIR_BEFORE+1000000000)) "Explorer developer airdrop reached wallet"
  ah="$(api_data GET '/admin/funding/airdrops?limit=100' "" 1)"; fh="$(api_data GET '/admin/funding/history?limit=100' "" 1)"; jq -e --arg s "$API_AIRDROP_SIGNATURE" 'any(.[];.signature==$s)'<<<"$ah" >/dev/null || fail "airdrop missing from airdrop history"; jq -e --arg s "$API_AIRDROP_SIGNATURE" 'all(.[];.signature!=$s)'<<<"$fh" >/dev/null || fail "airdrop leaked into Funding history"
  summary_append "## Backend flow: developer airdrop"; summary_append "- PASS: airdrop -> balance -> isolated history"
fi

if application_flow_enabled social-protocol; then
  for path in /registry /registry/social /registry/protocol /protocol/status /social/status '/posts?limit=10' '/engagement?limit=10' '/stakes?limit=10' '/rewards?limit=10' '/social/reward-accounts?limit=10' '/social/reward-settlements?limit=10' '/social/stake-yields?limit=10' '/social/anti-spam?limit=10' '/social/tips?limit=10' '/social/subscriptions?limit=10' '/social/unlocks?limit=10' '/social/revenues?limit=10' /social/domains '/social/feed?limit=10'; do body="$(api_request GET "$path")"; jq -e . >/dev/null<<<"$body" || fail "Explorer GET $path did not return JSON"; done
  AEKO_RPC_URL="$RPC_URL" AEKO_EXPLORER_API_URL="$EXPLORER_API_URL" python3 scripts/smoke-aeko-social.py
  AEKO_RPC_URL="$RPC_URL" AEKO_EXPLORER_API_URL="$EXPLORER_API_URL" python3 scripts/smoke-aeko-protocol.py
  summary_append "## Backend flow: Social + Protocol"; summary_append "- PASS: status/read endpoints + end-to-end smoke"
fi
fi

if [ "$CONTRACT_SCOPE" = "protocol" ] || [ "$CONTRACT_SCOPE" = "full" ]; then
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

if [ "$CONTRACT_SCOPE" = "chain" ] || [ "$CONTRACT_SCOPE" = "full" ]; then
  echo "==> Exercising all declared WebSocket subscriptions"
  python3 scripts/ci-rpc-ws-contract.py --host "$WS_HOST" --port 8900 --account "$RPC_FUNDING_ADDRESS" --signature "$RPC_FUNDING_SIGNATURE" --manifest "$ARTIFACT_DIR/ws-methods.txt"
fi


capture_diagnostics
echo "[PASS] production Coolify runtime contract scope $CONTRACT_SCOPE passed"
