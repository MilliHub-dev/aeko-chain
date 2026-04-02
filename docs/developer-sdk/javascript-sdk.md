# JavaScript / TypeScript SDK

The `@aeko-chain/web3.js` library is the primary tool for interacting with the AEKO Chain from a web browser or Node.js environment.

Current repo status:

- the first in-repo JS SDK scaffold now lives in [`sdk/js`](/Users/ok/Documents/projects/aeko-chain/sdk/js)
- it currently covers RPC helpers, injected wallet adapter helpers, and wallet-permission request planning
- it now also includes account/program-account helpers and AEKO-721 decoding helpers
- it now includes send / confirm transaction helpers and a websocket subscription example
- it now includes AEKO-721 prepared transaction builders used by the demo flow
- it now includes wallet-permissions prepared transaction builders for Phase 4.2 flows
- local `typecheck` and `build` now pass in `sdk/js`
- publish/build automation is still pending

## Installation

```bash
npm install @aeko-chain/web3.js
```

## Key Concepts

*   **Connection**: The RPC connection to the blockchain.
*   **Keypair**: A public/private key pair (wallet).
*   **PublicKey**: The address of an account or program.
*   **Transaction**: An atomic operation to be sent to the chain.
*   **SystemProgram**: Native program for creating accounts and transferring AEKO.

## Example: Sending AEKO

```javascript
import { 
    Connection, 
    Keypair, 
    Transaction, 
    SystemProgram, 
    sendAndConfirmTransaction 
} from '@aeko-chain/web3.js';

// 1. Connect
const connection = new Connection("https://api.devnet.aeko.chain");

// 2. Define Wallets
const fromWallet = Keypair.generate(); // In reality, load from file
const toWallet = Keypair.generate();

// 3. Create Transaction
const transaction = new Transaction().add(
    SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: toWallet.publicKey,
        lamports: 1000000000, // 1 AEKO
    })
);

// 4. Sign and Send
const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [fromWallet]
);

console.log("Transaction Signature:", signature);
```

## Current In-Repo Surface

The current scaffold exports:

- `AekoConnection`
- account and program-account query helpers
- AEKO-721 collection/token decoders
- AEKO-721 prepared transaction builders
- wallet-permissions prepared transaction builders
- send / confirm transaction helpers
- injected wallet adapter detection helpers
- wallet permission action request builders

See:

- [`sdk/js/src/index.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/src/index.ts)
- [`sdk/js/src/connection.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/src/connection.ts)
- [`sdk/js/src/accounts.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/src/accounts.ts)
- [`sdk/js/src/base58.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/src/base58.ts)
- [`sdk/js/src/builders.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/src/builders.ts)
- [`sdk/js/src/transactions.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/src/transactions.ts)
- [`sdk/js/src/wallet.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/src/wallet.ts)
- [`sdk/js/src/permissions.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/src/permissions.ts)
