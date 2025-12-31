# Bridge Message Flow

How a message travels from Ethereum to AEKO.

## Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant EthContract
    participant Relayer
    participant Guardians
    participant AekoContract

    User->>EthContract: Deposit ETH (Lock)
    EthContract-->>Relayer: Emit DepositEvent
    Relayer->>Guardians: Submit Proof of Deposit
    Guardians->>Guardians: Verify & Sign (Consensus)
    Guardians-->>Relayer: Return Signature
    Relayer->>AekoContract: Mint wETH (with Sig)
    AekoContract->>User: Credit wETH
```

## Confirmation Times
*   **Ethereum -> AEKO**: ~15 minutes (Requires 64 Eth blocks for finality).
*   **AEKO -> Ethereum**: ~20 minutes (Optimistic delay for fraud proofs).
