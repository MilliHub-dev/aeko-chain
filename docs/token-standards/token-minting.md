# Token Minting Guide

How to issue your own AEKO-20 token (e.g., a Community Coin or DAO Token).

## Using the CLI

1.  **Create the Mint**
    ```bash
    aeko-token create-token
    # Output: Address of the new token mint
    ```

2.  **Create an Account to hold the tokens**
    ```bash
    aeko-token create-account <TOKEN_ADDRESS>
    ```

3.  **Mint Tokens**
    ```bash
    aeko-token mint <TOKEN_ADDRESS> 1000000
    ```

## Using the JS SDK

```javascript
import { createMint } from '@aeko-chain/web3.js';

const mint = await createMint(
  connection,
  payer,
  mintAuthority.publicKey,
  freezeAuthority.publicKey,
  9 // Decimals
);
```
