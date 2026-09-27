# Treasury Management

Status: Economic policy defined; governed spending execution not yet implemented

The AEKO Treasury is the protocol reserve used for governance-approved ecosystem
spending. Economic values in this page are subordinate to
[`tokenomics.md`](../../tokenomics.md), which is the Phase 2 tokenomics source
of truth.

## Economic source of truth

The signed-off native AEKO allocation is:

- Treasury: `20%` = `100,000,000,000 AEKO`
- Ecosystem / Grants: `8%` = `40,000,000,000 AEKO`

These are distinct accounting buckets. A grant must identify the bucket it
debits; an operator must not relabel test Faucet liquidity as a treasury or
ecosystem allocation.

Transaction-fee routing is also defined by `tokenomics.md`:

- `40%` burn
- `40%` treasury
- `20%` validator tip

Older `50% / 50%` descriptions are obsolete.

## Treasury revenue

The target policy allows treasury value to come from:

1. the treasury share of transaction fees;
2. slashed validator balances; and
3. other governance-approved revenue streams.

## Treasury outflows

Governed outflows may include:

- ecosystem grants;
- developer incentives;
- public goods;
- approved SocialFi gas subsidies;
- protocol operations and security.

The separate Ecosystem / Grants allocation remains its own `40B AEKO` bucket
and must not be silently merged into the `100B AEKO` Treasury bucket.

## Governance requirement

Treasury or ecosystem spending on mainnet is not a Faucet operation and is not
an Operations Web "manual grant".

The governance design in
[`governance-overview.md`](./governance-overview.md) and
[`proposals.md`](./proposals.md) requires an approved on-chain proposal and a
timelocked execution path before a treasury spend can execute.

**Current implementation boundary:** the repository does not yet contain the
two-house governance program/executor described by those documents, and the
protocol bootstrap currently creates custody accounts without provisioning the
documented allocation amounts into a governed spend mechanism. Therefore
mainnet treasury/grant execution must remain fail-closed. Operations Web must
not expose the test-network Faucet path as a substitute.

## Test-network funding is separate

Testnet/devnet/localnet funding uses test liquidity:

- Aeko Scan may submit a public grant request.
- Only authenticated Operations Admin may approve or reject that grant.
- The Explorer backend enforces policy and performs settlement through the
  protected Validator `requestAirdrop` path and private Faucet.
- Developer Test Console airdrops are direct test-network utilities and use a
  separate ledger from Admin-approved grants.

None of those flows debit, unlock, or represent a mainnet Treasury,
Ecosystem/Grants, Team, Community, Public Sale, or Validator Rewards allocation.

## Transparency requirement

When governed mainnet spending is implemented, every approved movement must be
on-chain, linked to its governance decision and allocation bucket, and
indexable by Aeko Scan. Until that execution path exists, documentation and UI
must describe it as unavailable rather than simulate a treasury dashboard.
