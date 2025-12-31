# Bridge Overview

The **AEKO Bridge** connects the AEKO Chain to the wider crypto ecosystem (Ethereum, Solana, BSC).

## Architecture: Lock and Mint

1.  **Lock**: User sends ETH to a smart contract on Ethereum.
2.  **Verify**: The **AEKO Guardian Network** (a subset of high-reputation validators) observes the deposit.
3.  **Mint**: The Guardians sign a message, minting an equivalent `wETH` (Wrapped ETH) on AEKO Chain.

## Security Model: Multi-Sig + Reputation

Unlike traditional bridges that rely on a small set of signers, AEKO Bridge security scales with the **Reputation** of the guardians.
*   To authorize a mint, signers representing >66% of the **Total Guardian Reputation** must sign.
*   *Slashing*: If a Guardian signs a fraudulent mint, their Reputation is zeroed out and their staked AEKO is burned.

## Supported Assets

*   **Native**: AEKO
*   **Wrapped**: wETH, wSOL, wBTC, USDC (Bridged)
*   **Native Stablecoins**: USDC (Native - coming soon)
