# Bridge Security Model

The AEKO Bridge prioritizes safety over liveness.

## Guardian Network
*   **Selection**: Guardians are elected from the top 20 Validators by stake.
*   **Threshold**: 14/20 signatures required for any minting event.
*   **Rotation**: Guardian set rotates every Epoch (2 days).

## Fraud Proofs (Optimistic)
For high-value transfers (> $100k), there is a 4-hour "Challenge Period".
*   Anyone can submit a **Fraud Proof** showing that the source transaction was invalid.
*   If proven, the Guardians are slashed, and the transfer is cancelled.

## Rate Limits
*   **Global Cap**: Max $10M bridged per 24 hours.
*   **Per-User Cap**: Max $100k per transaction (without KYC).
