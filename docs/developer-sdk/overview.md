# Developer SDK Overview

The AEKO Chain ecosystem provides a suite of tools for developers to build decentralized social applications (dApps).

## Official SDKs

| Language | Package | Description |
| :--- | :--- | :--- |
| **JavaScript / TypeScript** | `@aeko-chain/web3.js` | The core library for frontend and Node.js backend. |
| **Rust** | `aeko-program` | For writing on-chain smart contracts (programs). |
| **Python** | `aeko-py` | For data analysis, scripts, and AI integration. |
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
