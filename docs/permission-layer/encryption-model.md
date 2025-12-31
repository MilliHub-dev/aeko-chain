# Encryption Model

AEKO Chain employs a multi-layered encryption strategy to protect data privacy while maintaining verifiable integrity.

## 1. Transport Encryption
All RPC and P2P traffic is encrypted via **TLS 1.3** and **Noise Protocol Framework**.

## 2. Content Encryption (Social Privacy)
For private DMs and "Friends Only" posts:
*   **AES-256-GCM**: The content payload is encrypted with a symmetric key.
*   **ECIES (Elliptic Curve Integrated Encryption Scheme)**: The symmetric key is encrypted with the recipient's Public Key.
*   This ensures only the intended recipient can decrypt the content, even though the encrypted blob is public on IPFS.

## 3. Zero-Knowledge Proofs (ZKPs)
For identity verification without revealing data:
*   *Scenario*: User wants to prove they are over 18 without revealing their DOB.
*   *Solution*: User submits a **zk-SNARK** proof generated from their L2 Credential.
*   The chain verifies the proof, not the raw data.
