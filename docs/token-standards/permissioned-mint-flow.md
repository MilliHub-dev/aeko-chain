# Permissioned Mint Flow

Status: Draft implementation note

This document describes how `PublicMintControlled` AEKO-20 assets are issued through the AEKO public minting module.

## Objective

The permissioned mint flow ensures public issuance is rate-limited, abuse-checked, subsidy-aware, and auditable before token supply changes.

## Request Shape

A public mint request includes:

- public mint state account
- AEKO-20 mint account
- destination AEKO-20 token account
- tokenomics state account
- requesting wallet account
- requesting wallet signer
- mint authority signer

## On-Chain Flow

1. The public mint program validates policy state and wallet eligibility.
2. It checks blocklist, allowlist, cooldown, per-window caps, anomaly thresholds, and subsidy rules.
3. It validates that the destination AEKO-20 token account belongs to the requesting wallet and target mint.
4. It invokes AEKO-20 `MintPublicTo`.
5. AEKO-20 validates that:
   - the mint uses `PublicMintControlled`
   - the controller state account is external to the AEKO-20 program
   - the configured mint authority signed
   - the destination account is valid and not frozen
   - the mint supply cap is not exceeded
6. AEKO-20 updates mint supply and destination balance.
7. The public mint program persists the wallet-window and subsidy usage state.

## Operational Notes

- The mint authority for `PublicMintControlled` mints should be held by a controlled mint service, not by arbitrary users.
- The user wallet still signs the request so issuance remains attributable to wallet-level rate limits and abuse controls.
- This is the current protocol separation path. A future hardening step can bind each mint to a specific public mint controller program id.
