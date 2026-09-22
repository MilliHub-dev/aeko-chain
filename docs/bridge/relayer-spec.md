# Relayer Specification

Relayers are the "couriers" of the bridge. They physically move the data packets between chains.

## Responsibilities
1.  **Monitoring**: Watch the `Deposit` events on the source chain (e.g., Ethereum).
2.  **Proposing**: Submit a `MintProposal` transaction to the AEKO Chain.
3.  **Finalizing**: Collect signatures from Guardians and execute the mint.

## Incentives
*   **Relayer Fee**: Users pay a small fee (e.g., 0.1%) for the bridging service. This fee covers the gas costs on both chains + a profit margin for the Relayer.

## Running a Relayer

This document describes the bridge/relayer design. Do not infer that a public AEKO bridge or mainnet endpoint is deployed from this example.

```bash
# Example against an explicitly chosen AEKO network.
aeko-bridge-relayer start \
  --eth-rpc <ETHEREUM_RPC_URL> \
  --aeko-rpc <AEKO_RPC_URL> \
  --keypair relayer-wallet.json
```

For current public-testnet development, `<AEKO_RPC_URL>` is `https://rpc.aeko.online`.
