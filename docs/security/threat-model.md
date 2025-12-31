# Threat Model

Security on AEKO Chain is analyzed through three primary vectors: **Consensus**, **Application**, and **Social**.

## 1. Consensus Attacks
*   **51% Attack**: An attacker acquires >50% of the stake.
    *   *Mitigation*: High cost of AEKO tokens + "Citizen House" veto power can fork malicious validators out.
*   **Long Range Attack**: Attacker creates a secret alternative chain history.
    *   *Mitigation*: **Proof of History (PoH)** hashes make it computationally impossible to fake a long history quickly.

## 2. Application Attacks
*   **Reentrancy**: A contract calls back into itself.
    *   *Mitigation*: AEKO SVM (Rust) separates state from code, making reentrancy much harder than on EVM.
*   **Front-running (MEV)**: Bots sniping transactions.
    *   *Mitigation*: Local fee markets reduce the incentive for network-wide MEV.

## 3. Social Attacks (Unique to AEKO)
*   **Sybil Attack**: Creating millions of fake accounts to game the rewards.
    *   *Mitigation*: The **Permission Layer** (L1 Clearance) requires biometric/social proof for rewards.
*   **Deepfake Propaganda**: Flooding the network with fake news.
    *   *Mitigation*: **Content Signatures** allow users to filter their feed to show only "Signed by Verified News Orgs".
