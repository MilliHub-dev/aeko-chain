# AEKO-20 Token Standard

AEKO-20 is the fungible token standard for the AEKO Chain, built on top of the SPL Token standard but with enhanced identity and permission features.

## Key Features

1.  **Identity Hooks**: Transfers can be restricted based on the sender's or receiver's clearance level.
    *   *Example*: A "Whale Token" that can only be held by verified investors (L3+).
2.  **Taxation**: Built-in transfer fees that can be directed to a creator or treasury.
3.  **Soulbound Option**: Tokens can be made non-transferable (SBTs) for certifications.

## Data Structure

```rust
pub struct Aeko20Mint {
    pub mint_authority: Option<Pubkey>,
    pub supply: u64,
    pub decimals: u8,
    pub is_initialized: bool,
    pub freeze_authority: Option<Pubkey>,
    // AEKO Extensions
    pub transfer_hook_program_id: Option<Pubkey>, // For custom logic
    pub required_clearance: u8, // Min clearance level to hold
}
```

## Creating an AEKO-20 Token

```bash
# Create a standard token
aeko-token create-token

# Create a restricted token (L3+ only)
aeko-token create-token --clearance 3
```
