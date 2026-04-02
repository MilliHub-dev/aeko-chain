# Developer SDK Overview

The AEKO Chain ecosystem provides a suite of tools for developers to build decentralized social applications (dApps).

## Official SDKs

| Language | Package | Description |
| :--- | :--- | :--- |
| **JavaScript / TypeScript** | `@aeko-chain/web3.js` | Frontend-focused RPC, wallet, account, and transaction SDK. |
| **Node.js** | `@aeko-chain/sdk` | Backend SDK for server-side signing, batching, and listeners. |
| **Rust** | `aeko-program` | On-chain program SDK. |
| **Rust** | `aeko-rust-sdk` | High-level off-chain Rust SDK for AEKO app clients. |
| **Python** | `aeko-sdk` | Python SDK for scripting, analytics, monitoring, and automation. |
| **CLI** | `aeko-cli` | Command-line tools for wallet management and deployment. |

## Quick Start

### Installation
```bash
npm install @aeko-chain/web3.js
```

### Connection
```javascript
import { Connection, clusterApiUrl } from '@aeko-chain/web3.js';

const connection = new Connection(clusterApiUrl('devnet'));
console.log("Connected to AEKO Devnet");
```

## Current Repo Status

- JavaScript SDK scaffold and verified local build live in [`sdk/js`](/Users/ok/Documents/projects/aeko-chain/sdk/js)
- Node.js SDK scaffold and verified local build live in [`sdk/node`](/Users/ok/Documents/projects/aeko-chain/sdk/node)
- the new high-level Rust client SDK now lives in [`sdk/rust-client`](/Users/ok/Documents/projects/aeko-chain/sdk/rust-client)
- the Python SDK scaffold now lives in [`sdk/python`](/Users/ok/Documents/projects/aeko-chain/sdk/python)
- cross-SDK publication tracking now lives in [`docs/developer-sdk/phase4-sdk-publication.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/phase4-sdk-publication.md)
- per-SDK release steps now live in [`docs/developer-sdk/phase4-sdk-release-steps.md`](/Users/ok/Documents/projects/aeko-chain/docs/developer-sdk/phase4-sdk-release-steps.md)
