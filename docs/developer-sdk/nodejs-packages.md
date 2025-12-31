Node.js Packages
Packages

| Package           | Purpose                 |
| ----------------- | ----------------------- |
| @aeko/sdk         | Core SDK                |
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

