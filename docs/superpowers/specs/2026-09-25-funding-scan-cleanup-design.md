# Funding + Scan cleanup design

Date: 2026-09-25
Status: Approved architecture, corrected implementation contract 2026-09-27

## 1. Decisions

The canonical product and trust boundaries are:

1. **Aeko Scan is the public request surface.** A user may request test funding and read the resulting request status from Scan.
2. **Operations Admin is the only grant decision surface.** Scan never approves or rejects a grant.
3. **A grant is not an airdrop.** Public/Admin grants use an approval queue; developer Test Console airdrops are direct, capped test utilities with their own ledger.
4. **Mainnet is not a Faucet environment.** Test funding and `requestAirdrop` are not treasury, ecosystem allocation, TGE, vesting, validator emission, or governed mainnet distribution.
5. **Each network is deployed independently.** Every Validator, Explorer API, database, registry and Operations Web deployment owns one `AEKO_NETWORK`. Aeko Scan may be configured with prefixed URLs for several independently deployed networks so the browser can switch between them. Those prefixes are routing metadata, not a monolithic multi-chain backend.
6. **Explorer backend owns test-funding policy and durable settlement state.** PostgreSQL is the only funding queue/ledger store. JSON funding state and the historic Funding Gateway role are retired.

## 2. Independent network topology

A single environment is deployed like this:

```text
                     one AEKO_NETWORK
                           |
Aeko Scan --------> Explorer API --------> PostgreSQL
   |                     |
   | public request      +------> Validator RPC
   | status read                     |
   |                                  +------> private Faucet (test/dev/local only)
   |
Operations Admin ---- authenticated server-side Explorer Admin API
```

A different network has a different deployment of those services and its own
chain identity, database, URLs and secrets.

Aeko Scan is allowed to carry a map such as:

```text
AEKO_MAINNET_RPC_URL / WS_URL / EXPLORER_API_URL
AEKO_TESTNET_RPC_URL / WS_URL / EXPLORER_API_URL
AEKO_DEVNET_RPC_URL  / WS_URL / EXPLORER_API_URL
```

Those values point at remote independent stacks. Generic `AEKO_RPC_URL`,
`AEKO_WS_URL` and `AEKO_EXPLORER_API_URL` still describe the Scan
deployment's default network. Server components do not use the prefixed matrix
to jump between chains.

## 3. Public grant lifecycle

### 3.1 Request

Scan calls:

```text
POST /funding/request
{ "address": "<wallet>" }
```

The Explorer backend validates:

- test/dev/local environment only;
- address shape;
- funding enabled;
- per-wallet cooldown;
- active duplicate request;
- daily public-grant budget.

The only successful initial state is `pending`. No chain transfer happens at
request creation.

Scan may later read:

```text
GET /funding/request/:id
```

This endpoint is status-only. It exposes no approval operation.

### 3.2 Admin decision

Authenticated Operations Admin calls the private/admin Explorer routes using
the server-side `AEKO_EXPLORER_SETTINGS_ADMIN_TOKEN`.

Only a `pending` public request can be:

- approved, moving into settlement; or
- rejected, moving to `rejected`.

Scan has no Admin token and the Scan proxy does not expose Admin mutation
routes.

### 3.3 Durable settlement state machine

```text
pending
  | approve (Admin only)
  v
processing
  | durable transaction signature
  v
submitted
  | chain confirms             | chain reports failure
  v                            v
confirmed                    failed

pending -- reject (Admin only) --> rejected
```

Rules:

- `processing` means the Admin approved the grant but no durable transaction
  signature has been persisted yet. Before the low-level RPC submission, the
  backend persists the exact recent blockhash used for that transaction intent.
- `submitted` means a signature exists and the amount remains budget-reserved.
- An observation timeout never converts `submitted` into a confirmed grant.
- Once a signature exists, reject and a second logical submission are forbidden.
- Admin reconciliation of `submitted` only checks the existing signature. It
  never creates a new transfer.
- If the RPC response is lost before a signature is persisted, the request stays
  `processing` with `FUNDING_SUBMISSION_RETRY_PENDING`. The background
  reconciler may replay **only the persisted transaction intent**: the same
  destination, amount, funding authorization and recent blockhash. The Faucet
  signs that identical intent deterministically, so the replay has the same
  transaction signature. Neither Scan nor Admin may manually retry it or choose
  a fresh blockhash.
- A confirmed grant is inserted exactly once and linked to its request id.
- A terminal on-chain failure releases the reservation and does not create a
  grant row.

## 4. Developer airdrop lifecycle

Developer Test Console airdrops call:

```text
POST /funding/airdrop
{ "address": "<wallet>", "amountAeko": <amount> }
```

They are:

- test/dev/local only;
- rate-limited;
- capped by both policy and Faucet hard ceiling;
- submitted directly without Admin approval;
- stored in `funding_airdrops`, not `funding_requests` or
  `funding_grants`.

Airdrop history and confirmed grant history must remain separate in Operations
Web.

## 5. Settlement authorization

The Explorer backend is the application settlement authority for test funding.
It sends the server-only `AEKO_FUNDING_AUTHORIZATION_KEY` in the
`requestAirdrop` RPC config. The matching Validator deployment validates that
key before using its private Faucet.

The secret is configured independently per network deployment. It must not be
injected into Aeko Scan JavaScript or exposed through Operations Web responses.

Managed test funding must never fall back to a browser direct
`requestAirdrop` call.

## 6. Mainnet boundary

For `AEKO_NETWORK=mainnet`:

- public funding policy/request/status routes are unavailable;
- developer airdrop is unavailable;
- Admin funding settings, queue, manual Faucet grant and reconciliation are
  unavailable;
- `AEKO_FUNDING_AUTHORIZATION_KEY` is not a mainnet distribution authority.

The economic target model in `tokenomics.md` defines Treasury,
Ecosystem/Grants, Community, Validator Rewards, Team and Public Sale
allocations. Mainnet distribution must debit a real governed allocation and be
authorized by the real governance/treasury execution path.

The repository does not yet implement the complete two-house governance
executor or provision those documented allocation buckets as spendable governed
reserves. Therefore mainnet grant/distribution UI must remain fail-closed rather
than reuse test funding.

## 7. Persistence

PostgreSQL owns:

- `funding_settings`
- `funding_requests`
- `funding_grants`
- `funding_airdrops`
- `funding_rate_events`

Retired sources of truth:

- `apps/admin/data/funding-state.json`
- public Admin funding page
- Admin direct-RPC funding client
- separate Funding Gateway service/role

## 8. Product terminology

Use these terms consistently:

- **Grant request**: user request submitted in Scan and decided by Admin.
- **Grant**: Admin-approved transfer that is confirmed on-chain.
- **Manual grant**: Admin-created test grant, still subject to test-network
  settlement limits.
- **Developer airdrop**: direct capped Test Console utility; no Admin approval.
- **Mainnet distribution**: governed token allocation movement; never call this
  a Faucet grant unless a future governance specification explicitly defines
  such a mechanism.
- **Aeko Scan**: public explorer/request UX.
- **Operations Web / Admin**: authenticated operator control plane.

## 9. Validation and acceptance

Repository validation must prove:

- Scan can create and read a grant request but cannot decide it;
- only authenticated Admin can approve/reject;
- processing cannot be rejected;
- submitted cannot be resubmitted;
- submitted remains budget-reserved until terminal chain outcome;
- confirmation creates exactly one grant;
- failed transfers create no grant;
- developer airdrops never enter the grant ledger or public grant budget;
- mainnet funding/airdrop routes fail closed;
- each backend uses only its active network config;
- Scan may route to independently deployed network APIs.

Deployment dogfood is mandatory before release:

```bash
AEKO_NETWORK=testnet \
AEKO_SCAN_URL=https://scan.example \
AEKO_OPERATIONS_URL=https://admin.example \
AEKO_RPC_URL=https://rpc.example \
AEKO_FUNDING_SMOKE_ADDRESS=<dedicated-test-wallet> \
ADMIN_PASSWORD='<operator-password>' \
python3 scripts/smoke-funding-e2e.py
```

The smoke test must prove:

```text
Scan request
  -> Scan cannot approve
  -> Admin login
  -> Admin approval
  -> protected RPC/Faucet settlement
  -> chain confirmation
  -> public status confirmed
  -> wallet balance increased
  -> exactly one confirmed grant
  -> grant absent from developer-airdrop ledger
```

Until that live test succeeds against a deployed test environment, funding is
not `INTEGRATION_VERIFIED`.
