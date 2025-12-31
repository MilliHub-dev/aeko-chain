# RPC Reference

Common methods used by developers.

## `getAccountInfo`
Returns all information associated with the account of provided Pubkey.

**Parameters**:
*   `pubkey` (string): Pubkey of account to query.

**Response**:
```json
{
  "context": { "slot": 1 },
  "value": {
    "data": ["base64..."],
    "executable": false,
    "lamports": 1000000000,
    "owner": "11111111111111111111111111111111",
    "rentEpoch": 0
  }
}
```

## `getBalance`
Returns the balance of the account of provided Pubkey.

## `sendTransaction`
Submits a signed transaction to the cluster for processing.
