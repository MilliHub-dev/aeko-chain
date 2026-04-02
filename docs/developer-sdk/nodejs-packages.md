Node.js Packages
Packages

| Package           | Purpose                 |
| ----------------- | ----------------------- |
| @aeko-chain/sdk   | Node.js backend SDK     |
| @aeko/relayer     | Bridge & relayer        |
| @aeko/permissions | Permission checks       |
| @aeko/indexer     | Chain indexing          |
| @aeko/crypto      | Encryption & signatures |

Backend Usage
const { verifySignature } = require("@aeko/crypto");

verifySignature(message, signature, address);

Use Cases

Relayers

Bridges

Indexers

Validators

Backend APIs

Current repo status:

- the in-repo Node.js SDK scaffold now lives in [`sdk/node`](/Users/ok/Documents/projects/aeko-chain/sdk/node)
- it currently covers a Node-first client wrapper, server-side signing abstractions, batch send helpers, and polling webhook-style listeners
- it now consumes the JS SDK through `@aeko-chain/web3.js` package exports instead of direct repo-local `dist` imports
- local `typecheck` and `build` now pass in `sdk/node`
- publish automation is still pending
