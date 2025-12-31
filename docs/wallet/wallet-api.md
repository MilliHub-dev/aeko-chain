# Wallet API

Integrate AEKO wallets into your dApp using the standard **Wallet Adapter** interface.

## Standard Interface

AEKO supports the `solana-wallet-adapter` standard with extensions for identity.

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
    params: { fields: ['reputation_score', 'clearance_level'] }
});

if (identity.clearance_level >= 3) {
    showEnterpriseDashboard();
}
```
