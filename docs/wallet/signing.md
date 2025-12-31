# Transaction Signing

How to sign and submit transactions programmatically.

## The Flow
1.  **Construct**: Build the `Transaction` object with instructions.
2.  **Fetch Blockhash**: Get the latest `recentBlockhash` from RPC.
3.  **Sign**: Use the private key to sign the serialized message.
4.  **Serialize**: Convert to raw wire format (base64).
5.  **Send**: POST to RPC `sendTransaction`.

## Code Example (Rust)

```rust
let tx = Transaction::new_signed_with_payer(
    &[instruction],
    Some(&payer.pubkey()),
    &[&payer],
    recent_blockhash,
);

let signature = client.send_and_confirm_transaction(&tx)?;
println!("Signature: {}", signature);
```
