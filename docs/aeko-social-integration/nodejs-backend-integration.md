# Backend Integration (Node.js)

For developers building social indexers, bots or alternative frontends against the **AEKO Public Testnet**.

## Listening for Social Posts

The Social Posts native program is registered with program ID
`29d2S7vB453rNYFdR5Ycwt7y9haRT5fwVwL9zTmBhfV2` (the base58 form of the runtime's `[17u8; 32]` program ID).

Use the canonical public testnet RPC/PubSub endpoints. The exact SDK subscription API must match the SDK version your application uses.

```javascript
const AEKO_RPC_URL = "https://rpc.aeko.online";
const AEKO_WS_URL = "wss://ws.aeko.online";
const SOCIAL_POSTS_PROGRAM_ID =
  "29d2S7vB453rNYFdR5Ycwt7y9haRT5fwVwL9zTmBhfV2";

// Use AEKO_RPC_URL for JSON-RPC reads/transactions.
// Use AEKO_WS_URL for PubSub subscriptions.
// Subscribe to logs for SOCIAL_POSTS_PROGRAM_ID with your chosen client.
```

Do not use the previous `SocialProtocol111...` placeholder: it is not the Social Posts program ID.
