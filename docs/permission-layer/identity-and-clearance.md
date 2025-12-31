# Identity and Clearance Levels

Access on AEKO Chain is governed by a tiered system of **Clearance Levels**.

## Clearance Hierarchy

| Level | Name | Requirement | Use Case |
| :--- | :--- | :--- | :--- |
| **L0** | **Public / Anon** | None (Just a wallet) | Browsing, Public Posting, Tipping. |
| **L1** | **Verified Human** | Proof of Humanity (Biometric/Social) | Voting, Monetization, preventing bots. |
| **L2** | **KYC / Financial** | Government ID Verification | DeFi, Investing, large transfers. |
| **L3** | **Enterprise** | Corporate Credentials (LDAP/SAML linked) | Internal tools, supply chain tracking. |
| **L4** | **Government** | Sovereign Identity Provider | Civic services, voting. |
| **L5** | **Military / Top Secret** | Hardware-bound Key (YubiKey) + Bio | Secure comms, command & control. |

## Issuing Authorities

Clearance tokens (SBTs) are issued by **Trusted Identity Providers (IdPs)**.
*   *Example*: "Clear" or "WorldID" could be an IdP for Level 1.
*   *Example*: A Bank could be an IdP for Level 2.
*   *Example*: The US DoD could be the sole IdP for a specific Level 5 subnet.
