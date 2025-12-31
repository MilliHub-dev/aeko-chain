# Gas and Fees

AEKO Chain uses a deterministic fee market designed to be low-cost for users while preventing spam.

## 1. Base Fee (Signature Fee)
*   Every transaction requires a base fee, calculated by the number of signatures it contains.
*   **Cost**: ~0.000005 AEKO per signature.
*   *Purpose*: Compensate validators for CPU time spent verifying Ed25519 signatures.

## 2. Compute Fee (Compute Units)
*   Complex transactions (smart contracts) consume "Compute Units" (CU).
*   You pay for the exact amount of computational resources your program uses.
*   *SocialFi Optimization*: Native instructions like `VerifyContentHash` are subsidized to be cheaper than generic computation.

## 3. Priority Fee
*   During network congestion, users can add an optional "tip" to prioritize their transaction.
*   **Local Fee Markets**: Unlike Ethereum where one NFT drop spikes fees for everyone, AEKO markets are *local*. A hot NFT mint only spikes fees for that specific contract; simple transfers or social posts remain cheap.

## 4. Rent (State Storage)
*   Storing data on-chain (e.g., creating a new Account or posting a permanent hash) requires a deposit called **Rent**.
*   **Rent Exemption**: If you maintain a minimum balance (e.g., 0.05 AEKO) in the account, you are rent-exempt and the data stays forever.
*   **Garbage Collection**: Accounts that fall below rent-exemption are purged, keeping the state size manageable.
