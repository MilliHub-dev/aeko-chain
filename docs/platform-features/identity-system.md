# Identity System

The Identity System is the core of AEKO Chain's social graph. It maps wallet addresses to human-readable profiles and reputation scores.

## Components

1.  **Identity PDA**: A unique account for each user derived from their wallet address.
2.  **Profile Data**:
    *   `Display Name`: "Alice"
    *   `Bio`: "Building on AEKO"
    *   `Avatar`: IPFS Hash
3.  **Reputation Score**: A dynamic score (0-1000) updated by the protocol based on activity.

## Reputation Calculation

Reputation is calculated off-chain by Oracle nodes (for performance) and posted on-chain.

$$
Reputation = (0.4 \times Activity) + (0.3 \times Followers) + (0.3 \times TokensHeld) - (Penalty)
$$

## API

```rust
// Rust SDK
let identity = aeko_identity::get_profile(&wallet_pubkey)?;
println!("Reputation: {}", identity.reputation);
```
