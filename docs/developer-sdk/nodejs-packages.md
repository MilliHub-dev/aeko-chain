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
- it currently covers a Node-first client wrapper, server-side signing abstractions, batch send helpers, polling webhook-style listeners, and first-pass SocialFi post helpers
- it now consumes the JS SDK through `@aeko-chain/web3.js` package exports instead of direct repo-local `dist` imports
- local `typecheck` and `build` now pass in `sdk/node`
- it is now published to npm as `@aeko-chain/sdk@0.1.0`
- the new post helper surface lives in [`sdk/node/src/socialPosts.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/node/src/socialPosts.ts) and is intended for Aeko Social backend hashing, signature verification, and `AnchorPost` transaction preparation
