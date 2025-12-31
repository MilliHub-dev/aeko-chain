# Verification & Blue Checks

Verification on Aeko Social is not a manual process by a centralized team; it is an on-chain cryptographic proof.

## Verification Tiers

1.  **Gray Check (L0)**: Phone Number verified (Off-chain oracle).
2.  **Blue Check (L1)**: "Proof of Humanity" verified (Biometric scan via WorldID or similar).
3.  **Gold Check (L3)**: Business/Organization verified (DUNS number or Corporate Registry linked).
4.  **Green Check (L4)**: Government Official (Sovereign IDP).

## How to Verify
To check if a user is verified in your app:

```javascript
const identity = await aeko.getIdentity(userPublicKey);
if (identity.badges.includes('verification_l1')) {
    renderBlueCheck(user);
}
```
