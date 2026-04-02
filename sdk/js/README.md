# `@aeko-chain/web3.js`

The in-repo JavaScript / TypeScript SDK scaffold for AEKO Chain.

Current scope:

- JSON-RPC client helpers
- account and program-account helpers
- AEKO-721 decoding helpers
- AEKO-721 prepared transaction builders
- wallet-permissions prepared transaction builders
- transaction send / confirm helpers
- websocket account subscriptions
- injected wallet adapter typing and helpers
- wallet permission action planning

This package is the Ticket 4.3 JS-first foundation. It is not published yet.

## Local Verification

```bash
npm --prefix sdk/js install
npm --prefix sdk/js run typecheck
npm --prefix sdk/js run build
```

## Local layout

- `src/connection.ts`: RPC client and subscription helpers
- `src/accounts.ts`: account queries and AEKO-721 decoders
- `src/base58.ts`: shared base58 helpers
- `src/builders.ts`: AEKO-721 prepared transaction builders
- `src/builders.ts`: AEKO-721 and wallet-permissions prepared transaction builders
- `src/transactions.ts`: send / confirm helpers
- `src/wallet.ts`: injected wallet adapter interfaces and helpers
- `src/permissions.ts`: wallet-permission action planning
- `src/index.ts`: public package exports

## Example

```ts
import {
  AekoConnection,
  buildGrantDelegateRequest,
  detectInjectedAekoWalletAdapter,
} from '@aeko-chain/web3.js';

const connection = new AekoConnection('https://api.testnet.aeko.chain');
const wallet = detectInjectedAekoWalletAdapter();

const latest = await connection.getLatestBlockhash();
const request = buildGrantDelegateRequest({
  permissionState: 'PermissionStatePubkey',
  auditLog: 'AuditLogPubkey',
  owner: 'OwnerPubkey',
  delegatePermission: {
    delegate: 'DelegatePubkey',
    role: 'spender',
    status: 'active',
    validFromEpoch: 1,
    validUntilEpoch: 10,
    spendLimit: {
      maxSingleTxAeko: 100,
      maxDailyAeko: 500,
      tokenCaps: [],
    },
    programAllowlist: [],
    tokenAllowlist: [],
    appScopeHashes: [],
    requiresReauth: false,
  },
  currentEpoch: 1,
  currentSlot: 10,
});

console.log(latest, wallet?.publicKey, request);
```

## Examples

- [`examples/basic-usage.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/examples/basic-usage.ts)
- [`examples/subscription-usage.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/examples/subscription-usage.ts)
- [`examples/permission-usage.ts`](/Users/ok/Documents/projects/aeko-chain/sdk/js/examples/permission-usage.ts)
