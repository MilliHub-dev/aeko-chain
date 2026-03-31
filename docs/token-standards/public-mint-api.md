# Public Mint API

Status: Draft integration reference

This document describes the intended product-facing surface for the AEKO public minting module.

## Purpose

The public mint API gives wallets, apps, and backend services a predictable way to request issuance for `PublicMintControlled` AEKO-20 assets while preserving on-chain policy enforcement.

## On-Chain Instructions

The public mint program currently exposes these instruction families:

- `InitializePolicy`
- `UpdatePolicy`
- `AddToBlocklist`
- `RemoveFromBlocklist`
- `AddToAllowlist`
- `RemoveFromAllowlist`
- `PublicMint`

## Suggested RPC / Service Endpoints

### `GET /public-mint/policy/:mint`

Returns the current mint policy and operational limits for a target mint.

Suggested response fields:

- `mint`
- `enabled`
- `per_wallet_limit`
- `window_epochs`
- `cooldown_epochs`
- `requires_allowlist`
- `fee_subsidy_enabled`
- `subsidy_app`
- `anomaly_threshold`

### `POST /public-mint/request`

Creates a public mint transaction payload for a wallet or app.

Suggested request body:

```json
{
  "mint": "MintPubkey",
  "destinationTokenAccount": "TokenAccountPubkey",
  "wallet": "WalletPubkey",
  "amount": "100",
  "appId": "OptionalAppPubkey",
  "requestedSubsidy": "10",
  "currentEpoch": 42
}
```

Suggested response body:

```json
{
  "program": "aeko-public-mint-program",
  "instruction": "PublicMint",
  "accounts": {
    "state": "PublicMintStatePubkey",
    "mint": "MintPubkey",
    "destinationTokenAccount": "TokenAccountPubkey",
    "tokenomicsState": "TokenomicsStatePubkey",
    "wallet": "WalletPubkey",
    "walletAuthority": "WalletPubkey",
    "mintAuthority": "MintAuthorityPubkey"
  }
}
```

### `GET /public-mint/window/:mint/:wallet`

Returns the wallet’s current mint window record.

Suggested response fields:

- `wallet`
- `mint`
- `window_start_epoch`
- `minted_in_window`
- `last_mint_epoch`
- `anomaly_score`
- `blocked`
- `subsidy_used_in_window`

## Admin API Surface

These admin actions should remain behind governance or operator tooling:

- policy creation
- policy updates
- blocklist management
- allowlist management
- subsidy-app assignment

## Failure Modes

Clients should expect these high-level rejections:

- policy disabled
- wallet blocked
- allowlist required
- cooldown active
- mint window exceeded
- invalid subsidy policy
- invalid destination token account

## Product Guidance

- Apps should read policy state before presenting mint UX.
- Wallet clients should show rate-limit and subsidy context before submission.
- Admin tools should treat blocklist and allowlist mutations as audited actions.
