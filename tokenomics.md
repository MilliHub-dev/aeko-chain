# AEKO Tokenomics

Status: Signed off for Phase 2 implementation

Owner: AEKO core team

Scope: This document defines the economic model for AEKO as the native gas, staking, governance, and SocialFi reward token. It is the source of truth for Phase 2 implementation. No AEKO-20, public minting, or AEKO-721 contract logic should hardcode economic values that conflict with this document.

## 1. Purpose

AEKO is the native token of AEKO Chain and serves four roles:

- gas token for transaction fees
- staking asset for validators and delegators
- governance asset for protocol and treasury decisions
- reward asset for validator incentives and SocialFi/community programs

The token model is designed to balance:

- low predictable network fees
- strong validator incentives
- long-term treasury sustainability
- controlled inflation during bootstrap
- deflationary pressure from transaction activity

## 2. Supply Model

### 2.1 Max Supply Baseline

- Baseline supply target: `500,000,000,000 AEKO`

### 2.2 Supply Allocation

| Bucket | Percent | Amount |
| --- | ---: | ---: |
| Validator Rewards (emissions) | 30% | 150,000,000,000 |
| Community & SocialFi Rewards | 25% | 125,000,000,000 |
| Treasury | 20% | 100,000,000,000 |
| Team & Contributors | 12% | 60,000,000,000 |
| Ecosystem / Grants | 8% | 40,000,000,000 |
| Public Sale / TGE | 5% | 25,000,000,000 |

Total: `500,000,000,000 AEKO`

### 2.3 Current Decision Required

Supply model decision:

- Signed off: Option B
- `500B` is the initial governed supply target
- The network may continue minting the perpetual `1%` floor inflation after the validator rewards bucket is exhausted

Implementation consequence:

- contracts and runtime accounting must support post-`500B` supply growth under the governed floor inflation policy
- the validator rewards reserve is still depleted and tracked separately from newly minted floor inflation

## 3. Genesis and Unlocking

### 3.1 Genesis Circulating Supply

Initial circulating supply at genesis should be limited to:

- public sale / TGE tokens
- any explicitly unlocked ecosystem, treasury, or team tranches approved at launch

Working assumption:

- genesis circulating supply starts at approximately `25B AEKO` from public sale
- additional circulating supply comes only from approved unlocked tranches

Signed-off genesis baseline:

- `genesis_circulating = 25,000,000,000 AEKO`
- source: public sale allocation

### 3.2 Vesting

Team & contributor tokens:

- vest over `1-2 years`
- include a `12-month cliff`

Signed-off default:

- 12-month vesting schedule
- 12-month cliff

Interpretation:

- team tokens are fully locked during the first 12 months
- the full vested allocation unlocks at the 12-month cliff

Ecosystem and treasury unlock schedules must be defined separately in governance-controlled distribution policies.

## 4. Inflation Schedule

### 4.0 Epoch Definition

Signed-off epoch timing:

- `epoch_duration = 1 day`
- `epoch_duration_seconds = 86,400`
- `epochs_per_year = 365`

### 4.1 Annual Inflation Targets

AEKO uses a declining inflation model to bootstrap validators early, then taper issuance as the network matures.

| Year | Annual Inflation | Approx. Tokens Emitted |
| --- | ---: | ---: |
| Year 1 | 8% | ~40B |
| Year 2 | 6% | ~30B |
| Year 3 | 4% | ~20B |
| Year 4 | 2% | ~10B |
| Year 5+ | 1% floor | ~5B/year |

### 4.2 Emission Source

- Emissions are funded first from the Validator Rewards bucket
- The Validator Rewards bucket is allocated `150B AEKO`
- Once that bucket is exhausted, inflation behavior depends on the signed-off supply model decision in Section 2.3

### 4.3 Epoch-Based Emissions

Validator rewards should be paid per epoch, not as ad hoc time-based distributions.

Signed-off per-epoch emissions:

| Year | Annual Emission | AEKO / Epoch |
| --- | ---: | ---: |
| Year 1 | 40,000,000,000 | 109,589,041 |
| Year 2 | 30,000,000,000 | 82,191,780 |
| Year 3 | 20,000,000,000 | 54,794,520 |
| Year 4 | 10,000,000,000 | 27,397,260 |
| Year 5+ | 5,000,000,000 | 13,698,630 |

Implementation rules:

- annual targets must be converted into deterministic per-epoch emissions
- rounding behavior must be deterministic
- emitted totals must be tracked on-chain
- the protocol must prevent duplicate reward issuance for the same epoch

Signed-off formula:

```text
epoch_emission = floor(year_target_emission / epochs_in_year)
```

Remainder handling:

- annual division remainder must accumulate in an emission carry bucket
- carry distribution must be deterministic and auditable
- floor inflation in Year 5+ is minted freshly under the signed-off Option B supply model

### 4.4 Floor Inflation

The perpetual `1%` floor exists to keep validators incentivized long-term.

- signed-off model: floor inflation continues beyond the initial `500B` governed supply target after the validator rewards reserve is exhausted

Signed-off perpetual floor parameters:

- `year_5+_inflation = 1%`
- `year_5+_emission = 5,000,000,000 AEKO`
- `year_5+_epoch_emission = 13,698,630 AEKO`

## 5. Validator and Delegator Rewards

### 5.1 Reward Sources

Validator and delegator rewards come from:

- epoch emissions
- validator tip portion of transaction fees

### 5.2 Reward Distribution

Each epoch reward cycle should follow this order:

1. determine total emission pool for the epoch
2. weight reward allocation by active stake
3. apply uptime multiplier
4. split delegator rewards proportionally by delegated stake
5. subtract validator commission from delegator-earned rewards
6. credit validator and delegator balances

Signed-off validator reward formula:

```text
stake_weight = validator_stake / total_staked_supply
gross_reward = (stake_weight × epoch_emission) × uptime_multiplier
validator_take = gross_reward × commission_rate
delegator_pool = gross_reward × (1 - commission_rate)
delegator_reward = delegator_pool × (delegator_stake / total_validator_stake)
```

Interpretation:

- each validator first earns a proportional share of the epoch emission based on stake weight
- the uptime multiplier adjusts that gross reward
- the resulting gross reward is then split between validator commission and delegators
- a slashed validator earns no reward for the affected epoch regardless of uptime

### 5.3 Uptime Bonus

- validators with uptime above `99%` qualify for a bonus multiplier

Signed-off uptime reward table:

| Uptime | Multiplier |
| --- | ---: |
| `>= 99%` | `1.10` |
| `>= 95% and < 99%` | `1.00` |
| `< 95% and >= 80%` | `0.80` |
| `< 80%` | `0.00` |

Signed-off uptime bonus threshold:

- `uptime_bonus_threshold = 99%`

### 5.4 Validator Commission

- validator commission is constrained to the `5-10%` range

Signed-off implementation rule:

- validator sets a commission rate
- protocol enforces a governance-defined max commission
- delegators receive rewards net of commission

Signed-off formula:

```text
validator_take = gross_reward × commission_rate
delegator_pool = gross_reward × (1 - commission_rate)
delegator_reward = delegator_pool × (delegator_stake / total_validator_stake)
```

### 5.5 Slashing

Slashing applies to:

- downtime beyond governance-defined thresholds
- double-signing

Current policy:

- slashed amounts are routed to treasury

Signed-off slashing parameters:

- `slash_downtime = 0.5% of stake`
- `slash_double_sign = 5% of stake`
- `slash_destination = treasury`
- slashed epochs receive `0` reward regardless of uptime multiplier

## 6. Fee Model

### 6.1 Base Fee

- target base fee: `0.00025 AEKO` per transaction

This should remain adjustable through governance rather than hardcoded permanently.

### 6.2 Priority Fee

- users may attach an optional priority fee for faster inclusion

### 6.3 Social Subsidy

- `social_subsidy_enabled = true`
- `social_subsidy_monthly_cap = 1,000,000 AEKO per registered app`
- this cap is governable

### 6.4 Fee Goals

The fee model should prioritize:

- low predictable fees
- support for high-frequency social interactions
- optional fee markets for urgency-sensitive transactions

## 7. Fee Routing

For each fee-bearing transaction, the total fee collected is split as follows:

| Destination | Percent |
| --- | ---: |
| Burn | 40% |
| Treasury | 40% |
| Validator Tip | 20% |

### 7.1 Burn

- `40%` of collected transaction fees are burned
- this provides long-term deflationary pressure as usage grows

### 7.2 Treasury

- `40%` of collected transaction fees are routed to treasury
- treasury funds ecosystem growth, grants, subsidies, and network operations

### 7.3 Validator Tip

- `20%` of collected transaction fees are routed as validator tips
- this supplements epoch emissions and encourages reliable block production

## 8. Treasury Policy

Treasury receives value from:

- treasury share of transaction fees
- slashed validator balances
- any additional governance-approved revenue streams

Treasury outflows may include:

- ecosystem grants
- developer incentives
- public goods funding
- social app fee subsidies
- operations and security

This document sets the revenue side of tokenomics. Treasury spending policy should remain governed separately.

## 9. Social App Fee Subsidy

AEKO Chain supports an optional fee subsidy program for approved social applications.

### 9.1 Purpose

The subsidy program allows approved apps to cover gas costs for end users up to a controlled monthly limit.

### 9.2 Funding Source

- subsidies are funded by treasury

### 9.3 Controls

The subsidy program must support:

- application registration or approval
- monthly subsidy cap
- per-app cap
- revocation for abuse
- auditable accounting

Signed-off default cap:

- `1,000,000 AEKO` per registered app per month

### 9.4 Governance Controls

Governance may adjust:

- subsidy cap
- app eligibility requirements
- subsidy categories
- burn ratio and base fee if needed for network balance

## 10. SocialFi and Community Rewards

The Community & SocialFi Rewards bucket is reserved for:

- creator incentives
- community growth programs
- engagement rewards
- ecosystem-aligned distribution campaigns

This bucket should not be mixed with validator emissions in implementation.

Reward mechanisms built on top of this bucket must include abuse resistance and clear accounting.

## 11. Implementation Requirements

Phase 2 implementation must follow these rules:

- tokenomics values are configuration-driven and auditable
- fee routing must be atomic
- reward issuance must be deterministic per epoch
- supply accounting must prevent double minting
- reserve depletion must be tracked explicitly
- floor inflation behavior must follow the signed-off supply policy

Recommended tokenomics config baseline:

```text
epoch_duration = 86,400 seconds
epochs_per_year = 365
base_fee = 0.00025 AEKO
burn_rate = 40%
treasury_rate = 40%
validator_tip_rate = 20%
social_subsidy_enabled = true
social_subsidy_monthly_cap = 1,000,000 AEKO per app
min_commission = 5%
max_commission = 10%
uptime_bonus_threshold = 99%
slash_downtime = 0.5%
slash_double_sign = 5%
```

Governable fields:

- `base_fee`
- `burn_rate`
- `treasury_rate`
- `social_subsidy_monthly_cap`
- `epoch_duration`
- `floor_inflation_rate`

## 12. Summary

- supply baseline: `500B AEKO`
- genesis liquid baseline: approximately `25B AEKO` plus approved unlocked tranches
- epoch duration: `1 day`
- epochs per year: `365`
- validator rewards reserve: `150B AEKO`
- inflation curve: `8% -> 1%`
- base fee target: `0.00025 AEKO`
- fee split: `40% burn / 40% treasury / 20% validator tip`
- signed-off team vesting default: `24 months` with `12-month cliff`
- signed-off team vesting default: `12 months` with `12-month cliff`, unlocking at cliff
- slashing destination: treasury
- social app fee subsidies: treasury-funded and governance-controlled

## 13. Reward Formula Example

Reference example for Year 1, Epoch 1:

```text
total_staked_supply = 200,000,000,000 AEKO
validator_stake     =   2,000,000,000 AEKO
epoch_emission      =     109,589,041 AEKO
uptime              = 99.5%
uptime_multiplier   = 1.10
commission_rate     = 8%
stake_weight        = 0.01
gross_reward        = 1,205,479 AEKO
validator_take      = 96,438 AEKO
delegator_pool      = 1,109,041 AEKO
```

This example is normative for formula interpretation, with final implementation using deterministic integer math and documented rounding behavior.

## 14. Sign-Off Checklist

- [x] Supply model approved
- [ ] Genesis circulating assumptions approved
- [x] Team vesting schedule approved
- [x] Inflation schedule approved
- [x] Epoch emission method approved
- [x] Validator reward formula approved
- [x] Validator commission bounds approved
- [x] Slashing policy approved
- [x] Fee split approved
- [x] Subsidy policy approved
- [ ] This document approved as Phase 2 source of truth

## 15. Compatibility Note

This document supersedes older placeholder numbers in existing docs where they conflict, including any earlier treasury or staking pages that referenced different fee split or reward assumptions.
