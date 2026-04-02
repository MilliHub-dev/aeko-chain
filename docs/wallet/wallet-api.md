# Wallet API

Integrate AEKO wallets into your dApp using the standard **Wallet Adapter** interface.

Identity behavior should align to [`docs/wallet/identity.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/identity.md).

## Standard Interface

AEKO supports the `aeko-wallet-adapter` standard with extensions for identity.

```javascript
// Connect to wallet
await window.aeko.connect();

// Check if connected
if (window.aeko.isConnected) {
    console.log("User:", window.aeko.publicKey.toString());
}

// Sign a message (Proof of Ownership)
const message = new TextEncoder().encode("Login to Aeko Social");
const signature = await window.aeko.signMessage(message);
```

## Identity Extensions

```javascript
// Request Identity Data (Requires user permission)
const identity = await window.aeko.request({
    method: 'get_identity',
    params: { fields: ['did', 'reputation_score', 'clearance_level'] }
});

if (identity.clearance_level >= 3) {
    showEnterpriseDashboard();
}
```

Recommended resolver shape:

```javascript
const resolved = await window.aeko.request({
  method: 'resolve_identity',
  params: { did: 'did:aeko:<wallet_pubkey>' }
});
```

## Permission Management

Wallet-facing permission controls should build on the wallet core permission helper layer and the on-chain wallet-permissions program.

Supported wallet-side actions now include:

- initialize permission state
- grant delegate permissions
- update delegate permissions
- revoke delegate permissions
- freeze wallet permission state
- unfreeze wallet permission state
- record delegate usage
- read effective delegate permissions

These flows should align with [`docs/wallet/permission-controls-spec.md`](/Users/ok/Documents/projects/aeko-chain/docs/wallet/permission-controls-spec.md).
