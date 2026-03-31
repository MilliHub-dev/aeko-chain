# Phase 2 Task Plan

## Scope

Phase 2 covers AEKO tokenomics, fungible token standards, public minting controls, and NFT standards. Work must happen in dependency order:

1. Tokenomics Foundation
2. Ticket 2.1 - AEKO-20 Token Standard
3. Ticket 2.3 - Public Token Minting Module
4. Ticket 2.2 - AEKO-721 NFT Standard

No contract implementation should begin until the tokenomics document is finalized and signed off.

## Phase 2 Deliverables

- `tokenomics.md`
- `aeko-20.md`
- AEKO-20 reference implementation
- Public minting module implementation and permissioned mint flow docs
- `aeko-721.md`
- AEKO-721 reference implementation
- Testnet deployments for AEKO-20 and AEKO-721 demo flows
- [`docs/token-standards/phase2-implementation-spec.md`](/Users/ok/Documents/projects/aeko-chain/docs/token-standards/phase2-implementation-spec.md)

## Tokenomics Foundation

Status: Blocking milestone for all other Phase 2 work.

### Objective

Lock the AEKO economic model before implementing contracts that depend on supply, emissions, fee routing, or reward distribution.

### Required Outputs

- Finalized `tokenomics.md`
- Explicit sign-off on supply, emissions, validator rewards, fee split, and subsidy policy

### Tokenomics Baseline

#### Total Supply

- Max supply: `500,000,000,000 AEKO`

#### Supply Allocation

| Bucket | Percent | Amount |
| --- | ---: | ---: |
| Validator Rewards (emissions) | 30% | 150B |
| Community & SocialFi Rewards | 25% | 125B |
| Treasury | 20% | 100B |
| Team & Contributors | 12% | 60B |
| Ecosystem / Grants | 8% | 40B |
| Public Sale / TGE | 5% | 25B |

#### Vesting

- Team tokens vest over `3-4 years`
- `12-month cliff`

#### Inflation Schedule

| Year | Annual Inflation | Tokens Emitted |
| --- | ---: | ---: |
| Year 1 | 8% | ~40B |
| Year 2 | 6% | ~30B |
| Year 3 | 4% | ~20B |
| Year 4 | 2% | ~10B |
| Year 5+ | 1% floor | ~5B per year |

Rules:

- Emissions initially come from the Validator Rewards bucket
- Once the Validator Rewards bucket is exhausted, emissions continue at the floor rate via fresh minting
- Long-term target is validator sustainability without hyperinflation

#### Validator Rewards

- Base reward paid per epoch from emissions
- Bonus multiplier for uptime above `99%`
- Delegators share rewards proportionally minus validator commission
- Suggested validator commission range: `5-10%`
- Slashing applies to downtime and double-signing
- Slashed amount routes to treasury

#### Fee Split

| Destination | Percent |
| --- | ---: |
| Burn | 40% |
| Treasury | 40% |
| Validator Tip | 20% |

#### Fee Model

- Base fee target: `0.00025 AEKO` per transaction
- Priority fee: optional user tip for faster inclusion
- Social app subsidy: treasury-funded fee subsidy up to a monthly cap for approved apps
- Governance may adjust base fee, subsidy cap, and burn ratio

#### Summary Targets

- Max supply: `500B AEKO`
- Circulating at genesis: approximately `25B` from public sale plus unlocked team/ecosystem tranches
- Inflation curve: `8% -> 1%` over 5 years
- Fee burn: `40%` of fees
- Perpetual floor inflation: `1%`

### Tokenomics Tasks

- Draft `tokenomics.md` with the baseline numbers above
- Define whether supply is hard cap plus post-exhaustion floor minting, or managed cap with governance override
- Convert annual inflation targets into protocol-level epoch emission math
- Define exact validator reward formula
- Define delegator reward share formula and validator commission handling
- Define slashing triggers, severity, and treasury routing
- Define exact fee accounting path for burn, treasury, and validator tips
- Define treasury-funded subsidy eligibility, limits, and revocation policy
- Resolve genesis circulating supply details and unlock schedule
- Review for consistency with staking, governance, and SocialFi reward plans
- Obtain sign-off before starting any implementation ticket

### Acceptance Criteria

- `tokenomics.md` exists and is internally consistent
- All percentages and token amounts reconcile to total supply
- Emissions are expressible in epoch-level logic
- Fee routing is explicit enough to implement without guesswork
- Team, treasury, ecosystem, and public-sale unlock assumptions are documented
- Sign-off recorded by stakeholders

## Ticket 2.1 - AEKO-20 Token Standard

Status: Starts only after tokenomics sign-off.

### Objective

Define and implement the canonical fungible token standard for AEKO assets.

### Tasks

- Define token metadata schema
  - name
  - symbol
  - decimals
  - supply cap
- Implement mint
  - authority-gated
  - respects tokenomics supply model
- Implement transfer
  - sender validation
  - balance checks
- Implement burn
  - reduces supply
  - feeds burn allocation rules
- Implement allowance
  - `approve`
  - `transferFrom`
- Wire in inflation schedule and validator reward distribution hooks
- Write `aeko-20.md`
- Deploy reference implementation to testnet

### Dependencies

- Signed-off `tokenomics.md`
- Final supply model
- Final inflation math
- Final fee and burn routing rules

### Acceptance Criteria

- Token metadata schema is documented
- Minting cannot exceed the approved supply model
- Transfers and burns update balances and total supply correctly
- Allowance flow is tested
- Inflation and validator reward hooks are aligned to signed-off tokenomics
- `aeko-20.md` is complete
- Reference implementation is deployed to testnet

## Ticket 2.3 - Public Token Minting Module

Status: Starts after AEKO-20 is implemented.

### Objective

Provide a controlled public minting path with rate limits, abuse prevention, and optional subsidy support.

### Tasks

- Define mint authority logic
  - who can mint
  - under what conditions
  - how it links to the supply model
- Implement rate limits
  - per wallet
  - per time window
- Implement abuse prevention
  - blocklist
  - cooldowns
  - anomaly flags
- Add optional fee subsidy hook for social app minting
- Expose and test the public mint endpoint
- Document the permissioned mint flow

### Dependencies

- AEKO-20 standard and reference implementation
- Signed-off tokenomics supply and subsidy policy

### Acceptance Criteria

- Mint authority logic is documented and enforced
- Rate limits and abuse controls are test-covered
- Subsidy hook respects treasury policy and monthly caps
- Public mint endpoint is documented and tested
- Permissioned mint flow doc is complete

## Ticket 2.2 - AEKO-721 NFT Standard

Status: Starts after AEKO-20 and public minting work are complete.

### Objective

Define and implement the canonical NFT standard for AEKO assets and SocialFi creator objects.

### Tasks

- Define NFT metadata schema
  - on-chain fields
  - off-chain URI
- Implement mint
  - unique token ID generation
- Implement transfer
  - ownership update
  - event emission
- Implement royalty logic
  - creator address
  - basis points
  - SocialFi rewards integration
- Implement metadata validation
  - URI format
  - required fields
- Write `aeko-721.md`
- Build and deploy NFT mint demo to testnet

### Dependencies

- Signed-off tokenomics where royalties and rewards touch treasury or creator incentives
- AEKO-20 reference assumptions if NFTs interoperate with AEKO-20 payments or fees

### Acceptance Criteria

- NFT metadata schema is documented
- Minting guarantees unique IDs
- Transfers update ownership correctly
- Royalty logic is deterministic and documented
- Metadata validation enforces required structure
- `aeko-721.md` is complete
- Demo deployment works on testnet

## Recommended Execution Checklist

- [ ] Draft and finalize `tokenomics.md`
- [ ] Sign off tokenomics before writing contract code
- [ ] Write AEKO-20 spec in `aeko-20.md`
- [ ] Implement AEKO-20 reference contract
- [ ] Test AEKO-20 mint, transfer, burn, and allowance flows
- [ ] Integrate inflation and validator reward hooks
- [ ] Deploy AEKO-20 reference implementation to testnet
- [ ] Implement public minting module
- [ ] Test rate limiting, abuse prevention, and subsidy hooks
- [ ] Document permissioned mint flow
- [ ] Write AEKO-721 spec in `aeko-721.md`
- [ ] Implement AEKO-721 reference contract
- [ ] Test NFT mint, transfer, royalty, and metadata validation flows
- [ ] Deploy AEKO-721 demo to testnet

## Notes

- Treat tokenomics as the source of truth for supply, emissions, fee routing, and rewards.
- Do not hardcode placeholder economic values in contracts before tokenomics sign-off.
- If tokenomics numbers change, revalidate AEKO-20 and public minting assumptions before implementing AEKO-721.
