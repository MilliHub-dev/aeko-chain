# Wallet Security

Best practices for securing your AEKO assets.

Security expectations should be read together with [`docs/wallet/identity.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/identity.md).

## User Security
1.  **Seed Phrase**: Never share your 12/24 word mnemonic.
2.  **Ledger Support**: Use a hardware wallet for balances > $1,000.
3.  **Phishing Protection**: AEKO wallets display a "Simulated Result" before you sign, showing exactly what balance changes will occur.

## Developer Security
1.  **Origin Checks**: Ensure the request comes from the whitelisted domain.
2.  **Replay Protection**: All transactions must include a recent Blockhash.
3.  **Auto-Disconnect**: Wallets should disconnect from dApps after 15 minutes of inactivity.
4.  **Identity Scope Checks**: dApps should request only the minimum identity fields needed for the user flow.
5.  **Attestation Privacy**: Wallets should expose KYC status or clearance summaries, not raw credential payloads.
