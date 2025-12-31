# JavaScript / TypeScript SDK

The `@aeko-chain/web3.js` library is the primary tool for interacting with the AEKO Chain from a web browser or Node.js environment.

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
