# AEKO Project Tasks

> Synced from Todoist on 2026-04-16

---

## Overview

**AEKO Chain** is a high-performance, SVM Layer-1 blockchain designed for SocialFi, secure military-grade communications, fintech-grade payments & settlements, and on-chain identity, reputation & governance.

**Core Priorities:** Performance (Solana-level TPS) | Security (military & financial standards) | Privacy (selective disclosure) | Developer Friendliness | Real-world Adoption (Africa-first, global-ready)

### Projects

| Project | Status |
|---------|--------|
| Aeko Chain | Active (14 open / 25 completed) |
| Aeko Web App | No tasks yet |
| Aeko Backend | No tasks yet |
| Aeko Mobile | No tasks yet |

---

## Aeko Chain

### Progress Summary

| Phase | Status | Completed |
|-------|--------|-----------|
| Phase 0 -- Project Setup & Alignment | Done | 2026-01-24 ~ 2026-03-10 |
| Phase 1 -- Core Blockchain (AEKO-SVM) | Done | 2026-03-10 |
| Phase 2 -- Token & NFT Standards | Done | 2026-03-31 |
| Phase 3 -- Permission Layer (Military + Fintech) | Done | 2026-04-16 |
| Phase 4 -- Wallet & SDKs | Done | 2026-04-02 ~ 2026-04-06 |
| Phase 5 -- RPC, Explorer & APIs | Done | 2026-04-06 ~ 2026-04-16 |
| Phase 6 -- AEKO Social Integration | In Progress | -- |
| Phase 7 -- Bridge | Pending | -- |
| Phase 8 -- Security, Testing & Launch | Pending | -- |

---

### DONE -- Phase 0: Project Setup & Alignment

> Rename chain identifiers, boot AEKO Chain locally, single validator runs, basic token transfers work.

- [x] **Ticket 0.1 -- Fork & Initialize Solana Codebase** *(completed 2026-01-24)*
  - Fork Solana repo, rename chain identifiers (AEKO), remove Solana branding, lock base Solana version
  - **Deliverable:** AEKO Chain compiles locally from fork

- [x] **Ticket 0.2 -- Define AEKO Chain Parameters** *(completed 2026-03-10)*
  - Chain ID, genesis config, block time target, fee model, inflation
  - **Deliverable:** `chain-config.md` + implemented constants

- [x] **Ticket 0.3 -- Repo & Directory Structure Setup** *(completed 2026-03-10)*
  - `/core`, `/runtime`, `/permission-layer`, `/bridge`, `/wallet`, `/explorer`, `/sdk`, `/docs`
  - **Deliverable:** Monorepo structure pushed to GitHub

---

### DONE -- Phase 1: Core Blockchain (AEKO-SVM)

> Proof of Stake (Tower BFT), validator onboarding, stake delegation, slashing rules. Multi-validator testnet with delegation & rewards working.

- [x] **Ticket 1.1 -- AEKO-SVM Runtime Customization** *(completed 2026-03-10)*
  - Integrate stateless signature hooks, modify transaction validation pipeline, enable external signature verification
  - **Deliverable:** Custom AEKO-SVM runtime module

- [x] **Ticket 1.2 -- Stateless Signature Model Implementation** *(completed 2026-03-10)*
  - Signature schema, hashing format, verification logic, timestamp anchoring
  - **Deliverable:** Verified stateless signature flow on-chain

- [x] **Ticket 1.3 -- Transaction Fee & Priority Model** *(completed 2026-03-10)*
  - Base fee logic, priority fee handling, zero-fee system txs
  - **Deliverable:** Custom fee scheduler active

---

### DONE -- Phase 2: Token & NFT Standards

> Native gas token (AEKO) for transactions, staking, governance, SocialFi rewards. Stable economic model, AEKO token live on testnet.

- [x] **Ticket 2.1 -- AEKO-20 Token Standard** *(completed 2026-03-31)*
  - Mint, transfer, burn, allowance, metadata
  - **Deliverable:** `aeko-20.md` + reference implementation

- [x] **Ticket 2.2 -- AEKO-721 NFT Standard** *(completed 2026-03-31)*
  - Mint, transfer, royalty logic, metadata validation
  - **Deliverable:** `aeko-721.md` + NFT mint demo

- [x] **Ticket 2.3 -- Public Token Minting Module** *(completed 2026-03-31)*
  - Mint authority logic, rate limits, abuse prevention
  - **Deliverable:** Public mint endpoint secured

---

### DONE -- Phase 3: Permission Layer (Military + Fintech)

> This is where AEKO becomes special. Encrypted transaction payloads, secure key management, permissioned subnets, fintech security. Government & fintech-ready architecture.

- [x] **Ticket 3.1 -- Permission Layer Core Architecture** *(completed 2026-04-16)*
  - Clearance levels, role mapping, access policies
  - **Deliverable:** Permission engine functional

- [x] **Ticket 3.2 -- Military-Grade Encryption Module** *(completed 2026-04-16)*
  - Key exchange, AES + ECC hybrid encryption, forward secrecy
  - **Deliverable:** Encrypted tx + message pipeline

- [x] **Ticket 3.3 -- Key Rotation & Revocation** *(completed 2026-04-16)*
  - Rotation schedules, revocation logic, emergency overrides
  - **Deliverable:** Key lifecycle management system

---

### DONE -- Phase 4: Wallet & SDKs

> Identity primitives (DID, wallet-based identity), reputation system, dev tools (SDKs, explorer, faucet, APIs). Third-party apps can launch, hackathon-ready chain.

- [x] **Ticket 4.1 -- AEKO Wallet Core** *(completed 2026-04-02)*
  - Key generation, signing, stateless signature support
  - **Deliverable:** Wallet core service running

- [x] **Ticket 4.2 -- Wallet Permission Controls** *(completed 2026-04-02)*
  - Spend limits, app permissions, multi-role access
  - **Deliverable:** Permissioned wallet flows

- [x] **Ticket 4.3 -- Developer SDKs** *(completed 2026-04-02)*
  - JS SDK, Node.js SDK, Rust SDK, Python SDK
  - **Deliverable:** SDKs published + examples working

---

### DONE -- Phase 5: RPC, Explorer & APIs

> On-chain posts metadata, creator rewards, engagement mining, anti-spam mechanisms. Fully on-chain SocialFi layer, Aeko app deeply integrated.

- [x] **Ticket 5.1 -- AEKO RPC Server** *(completed 2026-04-16)*
  - tx submit, block queries, signature verification
  - **Deliverable:** RPC live on testnet

- [x] **Ticket 5.2 -- Aeko Explorer Backend** *(completed 2026-04-06)*
  - Blocks, transactions, tokens, NFTs
  - **Deliverable:** Explorer backend deployed

- [x] **Ticket 5.3 -- Explorer Frontend** *(completed 2026-04-06)*
  - Block view, tx view, address view
  - **Deliverable:** Public AEKO Explorer

---

### IN PROGRESS -- Phase 6: AEKO Social Integration

> Connect Aeko Social app to on-chain infrastructure.

- [x] **Ticket 6.1 -- Post Signature Flow** *(completed 2026-04-04)*
  - Hash post, sign hash, verify on-chain
  - **Deliverable:** Immutable post verification live

- [ ] **Ticket 6.2 -- Node.js Backend Integration**
  - Signature service, verification endpoints, failure handling
  - **Deliverable:** Production-ready integration

---

### PENDING -- Phase 7: Bridge

> AEKO to external chain bridge for cross-chain interoperability.

- [ ] **Ticket 7.1 -- Bridge Architecture**
  - Message format, lock & mint logic
  - **Deliverable:** Bridge spec approved

- [ ] **Ticket 7.2 -- Relayer Implementation**
  - Event monitoring, signature aggregation, slashing logic
  - **Deliverable:** Bridge testnet operational

---

### PENDING -- Phase 8: Security, Testing & Launch

> Final security audit, testnet launch, mainnet readiness.

- [ ] **Ticket 8.1 -- Internal Security Audit**
  - Threat modeling & attack simulations
  - **Deliverable:** Audit report

- [ ] **Ticket 8.2 -- Testnet Launch**
  - Launch public AEKO testnet
  - **Deliverable:** Live testnet + docs

- [ ] **Ticket 8.3 -- Mainnet Readiness**
  - Prepare mainnet
  - **Deliverable:** Genesis + validator onboarding

---

## Operational Tasks (Unphaseed)

### Infrastructure

> Must be in place for production readiness.

- [ ] Testnet environment
- [ ] Validator dashboard
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Key management system
- [ ] Secure deployment pipeline
- [ ] Incident response playbook

### Product / Integration

- [ ] Aeko integration
- [ ] SDKs
- [ ] Wallets
- [ ] APIs

### Smart Contract Team

- [ ] Staking
- [ ] Governance
- [ ] Rewards
- [ ] Treasury

---

## Timeline

```
Jan 2026  [====] Phase 0 -- Fork & Setup
Mar 2026  [====] Phase 1 -- Core Blockchain (AEKO-SVM)
Mar 2026  [====] Phase 2 -- Token & NFT Standards
Apr 2026  [====] Phase 3 -- Permission Layer
Apr 2026  [====] Phase 4 -- Wallet & SDKs
Apr 2026  [====] Phase 5 -- RPC, Explorer & APIs
Apr 2026  [==  ] Phase 6 -- AEKO Social Integration  <-- YOU ARE HERE
          [    ] Phase 7 -- Bridge
          [    ] Phase 8 -- Security, Testing & Launch
```

---

*Last updated: 2026-04-16 | Source: Todoist*
