# Wallet Permissions

AEKO Wallets support granular permissions, allowing users to approve specific actions without giving full account access.

Permission behavior should be implemented against the wallet-anchored identity model in [`docs/wallet/identity.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/identity.md).
The implementation-facing source of truth for Ticket 4.2 is [`docs/wallet/permission-controls-spec.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/permission-controls-spec.md).

## Scopes
dApps can request the following scopes:

*   `identity.read`: Read public profile and reputation.
*   `identity.write`: Update profile picture or bio.
*   `social.post`: Post content on user's behalf (requires confirmation per post or "Auto-Approve" session).
*   `wallet.transfer`: Move funds (Always requires user confirmation).
*   `kyc.read`: Read KYC status summary when explicitly authorized.
*   `permissions.manage`: Grant or revoke wallet-level delegated permissions.

## Session Keys
For gaming and high-frequency social apps, users can generate a **Session Key**.
*   *Definition*: A temporary keypair with limited budget and expiry.
*   *Example*: "Allow this game to sign transactions up to 5 AEKO for the next 1 hour."

Session keys should never replace the root wallet identity anchor. They operate as delegated capabilities under the wallet controller.

## Implementation Notes

Phase 4.2 implementation should enforce:

- owner, spender, and viewer roles
- per-transaction, daily, and per-token spend caps
- program allowlists with explicit revocation
- time-bounded delegated permissions
- emergency freeze and unfreeze
- immutable audit logging for grant, revoke, freeze, and unfreeze
