# Governance Proposals

> **Implementation status:** normative target flow, not a claim of current
> runtime capability. No `GovernanceInstruction` implementation matching this
> lifecycle exists in the repository today. Mainnet treasury/allocation
> execution therefore remains unavailable rather than falling back to an Admin
> signer or Faucet path.
>
> The tokenomics `UpdateField` ABI remains present for compatibility, but it
> returns `GovernanceExecutionUnavailable` after authenticating the caller.
> No proposal may be represented by a protocol-authority signature alone.

Proposals are the mechanism for changing the AEKO Protocol.

## Proposal Types

1.  **Core Upgrade (AIP)**: Changes to the VM, consensus, or core programs.
2.  **Parameter Change**: Adjusting fees, inflation rates, or slashing conditions.
3.  **Treasury Spend**: Requesting funds for development, marketing, or liquidity.
4.  **Social Policy**: Updates to the Content Signature Layer (Citizen House only).

## Submission Process

1.  **Temperature Check**: Discourse post to gauge sentiment.
2.  **Snapshot Vote**: Off-chain signaling vote.
3.  **On-Chain Proposal**: Submit transaction with `GovernanceInstruction`.
    *   *Deposit*: 10,000 AEKO (returned if passed).
4.  **Voting**: 7-day voting period.
5.  **Execution**: Timelock delay (24h) then auto-execution.
