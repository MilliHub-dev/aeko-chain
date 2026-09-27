# Governance Overview

> **Implementation status:** this document defines the target governance model.
> The repository does not currently contain the two-house governance
> program/executor described below. Tokenomics parameter mutation or mainnet
> treasury spending must not be presented as governed execution until proposal,
> voting and timelock enforcement exist on-chain.
>
> The current tokenomics program now fails closed on `UpdateField` even for the
> protocol authority, and protocol bootstrap stores an unset
> `governance_program_id` rather than treating an operator signer as a
> governance program. Parameter updates remain unavailable until the executor
> described here is genuinely implemented.

AEKO Chain uses a **Two-House Governance System** to balance financial interests with community values.

## 1. The Token House (AEKO Holders)
*   **Power**: Approves technical upgrades, fee changes, and treasury spending.
*   **Voting Power**: 1 Token = 1 Vote.
*   **Focus**: Economic security and protocol sustainability.

## 2. The Citizen House (Reputation Holders)
*   **Power**: Vetos harmful proposals, manages the "Permission Layer" (e.g., adding/removing Identity Providers), and oversees SocialFi parameters (e.g., tweaking the algorithm).
*   **Voting Power**: 1 Identity (with L1+ Clearance) = 1 Vote.
*   **Focus**: Social integrity, censorship resistance, and community health.

## Proposal Lifecycle
1.  **Discussion**: Forum debate (off-chain).
2.  **Snapshot**: Signaling vote (off-chain).
3.  **On-Chain Proposal**: Submitted to the DAO (requires deposit).
4.  **Voting Period**: 3-7 days.
5.  **Timelock**: 24-hour delay before execution (for safety).
