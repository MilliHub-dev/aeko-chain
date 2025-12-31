# Relayer Specification

Relayers are the "couriers" of the bridge. They physically move the data packets between chains.

## Responsibilities
1.  **Monitoring**: Watch the `Deposit` events on the source chain (e.g., Ethereum).
2.  **Proposing**: Submit a `MintProposal` transaction to the AEKO Chain.
3.  **Finalizing**: Collect signatures from Guardians and execute the mint.

## Incentives
*   **Relayer Fee**: Users pay a small fee (e.g., 0.1%) for the bridging service. This fee covers the gas costs on both chains + a profit margin for the Relayer.

## Running a Relayer
Relayers do not need to be trusted (the Guardians provide the trust). Anyone can run a Relayer bot to earn fees.

```bash
# Example command to start a relayer
aeko-bridge-relayer start \
  --eth-rpc https://mainnet.infura.io/v3/... \
  --aeko-rpc https://api.mainnet-beta.aeko.chain \
  --keypair relayer-wallet.json
```
