# WebSocket API

Subscribe to real-time events on the blockchain.

## Subscription Methods

### `accountSubscribe`
Subscribe to updates on a specific account.
*   *Use Case*: Updating a user's balance in the UI instantly when they receive funds.

### `logsSubscribe`
Subscribe to transaction logs.
*   *Use Case*: Listening for "New Post" events from the Social Protocol.

## Example (JavaScript)
```javascript
const ws = new WebSocket('wss://api.devnet.aeko.chain');

ws.onopen = () => {
  ws.send(JSON.stringify({
    "jsonrpc": "2.0",
    "id": 1,
    "method": "accountSubscribe",
    "params": ["<ACCOUNT_PUBKEY>"]
  }));
};

ws.onmessage = (event) => {
  console.log("Update received:", event.data);
};
```
