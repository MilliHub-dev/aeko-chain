# `@aeko-chain/sdk`

The in-repo Node.js SDK scaffold for AEKO Chain.

Current scope:

- backend-friendly wrapper around `@aeko-chain/web3.js`
- server-side prepared-transaction signing abstractions
- batch send / confirm helpers
- polling-based event and account listeners for webhook-style integrations
- SocialFi post helpers for deterministic payload building, hashing, signature verification, and anchor transaction preparation

This package is the Ticket 4.3 Node.js foundation and is now published as `@aeko-chain/sdk`.

## Local Verification

```bash
npm --prefix sdk/node install
npm --prefix sdk/node run typecheck
npm --prefix sdk/node run build
```

## Release Note

The Node SDK now consumes `@aeko-chain/web3.js` through package exports instead of repo-local `dist` imports, which makes the boundary much closer to publish-ready.

## Local layout

- `src/client.ts`: Node-first connection wrapper
- `src/socialBackend.ts`: reusable SocialFi backend service and pluggable verification-store interfaces
- `src/socialPosts.ts`: post payload hashing, signature verification, and anchor transaction helpers
- `src/signing.ts`: prepared-transaction signing and batch helpers
- `src/webhooks.ts`: polling listeners for signatures and accounts
- `src/index.ts`: public exports

## Examples

- `examples/server-signing.ts`
- `examples/webhook-listener.ts`
- `examples/social-posts-backend.ts`

The SocialFi backend example now includes:

- deterministic post hash and verify routes
- prepared or submitted `AnchorPost` flow
- persisted verification lookup
- a pluggable store interface with a JSON-file reference implementation

The reusable backend module for that example now lives in:

- `src/socialBackend.ts`
