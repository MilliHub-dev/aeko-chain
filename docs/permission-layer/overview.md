# Permission Layer Overview

The **AEKO Permission Layer** is the defining feature of the chain. It allows AEKO to serve as a unified infrastructure for both open public networks and closed, high-security environments.

## The Concept: "One Chain, Many Rooms"

On Ethereum, every transaction is public. On a private Hyperledger instance, everything is siloed.
AEKO bridges this by using **On-Chain Access Control Lists (ACLs)** enforced by the validators.

## How it Works

Every transaction submitted to AEKO Chain is checked against the **Permission Protocol** before execution.

1.  **Public Zone (Level 0)**: No checks. Standard blockchain behavior.
2.  **Verified Zone (Level 1-2)**: Requires a "Verified Human" SBT.
3.  **Restricted Zone (Level 3-5)**: Requires specific cryptographic credentials issued by a Trusted Authority (e.g., a Corporate or Government entity).

## Architecture

The Permission Layer is implemented as a set of native eBPF programs that wrap the standard transaction processor.
*   **Gatekeeper Program**: Checks user credentials.
*   **Clearance Token**: A Soulbound Token (SBT) held in the user's wallet that proves their right to access a specific zone.
