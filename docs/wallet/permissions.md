# Wallet Permissions

AEKO Wallets support granular permissions, allowing users to approve specific actions without giving full account access.

## Scopes
dApps can request the following scopes:

*   `identity.read`: Read public profile and reputation.
*   `identity.write`: Update profile picture or bio.
*   `social.post`: Post content on user's behalf (requires confirmation per post or "Auto-Approve" session).
*   `wallet.transfer`: Move funds (Always requires user confirmation).

## Session Keys
For gaming and high-frequency social apps, users can generate a **Session Key**.
*   *Definition*: A temporary keypair with limited budget and expiry.
*   *Example*: "Allow this game to sign transactions up to 5 AEKO for the next 1 hour."
