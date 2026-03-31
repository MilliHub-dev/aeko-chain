# AEKO-721 NFT Standard

Status: Draft implementation spec

AEKO-721 is the canonical NFT standard for AEKO Chain. It is intended to support creator collectibles, profile badges, social assets, permissioned media, and royalty-aware items for the SocialFi layer.

## 1. Objectives

AEKO-721 must provide:

- unique token identifiers
- single-owner token state
- royalty-aware minting
- transfer semantics with ownership updates
- metadata validation for on-chain and off-chain fields
- compatibility with creator rewards and permission-aware application flows

## 2. Core State

### Collection

```rust
pub struct Aeko721Collection {
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub base_uri: Option<String>,
    pub total_minted: u64,
    pub is_initialized: bool,
}
```

### NFT

```rust
pub struct Aeko721Token {
    pub collection: Pubkey,
    pub token_id: u64,
    pub owner: Pubkey,
    pub creator: Pubkey,
    pub royalty_bps: u16,
    pub metadata: NftMetadata,
    pub frozen: bool,
    pub is_initialized: bool,
}
```

### Metadata

```rust
pub struct NftMetadata {
    pub name: String,
    pub description: Option<String>,
    pub uri: String,
    pub image_uri: Option<String>,
    pub attributes: Vec<MetadataAttribute>,
}
```

## 3. Metadata Rules

Minimum requirements:

- `name` must be non-empty
- `uri` must be non-empty
- `royalty_bps` must be within a bounded basis-point range
- metadata should support off-chain JSON, but required on-chain summary fields must remain available for indexers and wallets

Recommended URI targets:

- Arweave
- IPFS
- AEKO-hosted immutable media gateways

## 4. Instruction Surface

The reference program should support:

- `InitializeCollection`
- `MintNft`
- `FreezeNft`
- `ThawNft`
- `TransferNft`
- `UpdateMetadata`

## 5. Royalty Rules

AEKO-721 royalties must store:

- creator address
- royalty basis points

Royalty handling should be compatible with the broader SocialFi rewards layer, even if settlement hooks are introduced in a later phase.

## 6. Transfer Rules

Transfers must enforce:

- current owner signature
- token ownership validation
- frozen-token rejection
- metadata and collection linkage consistency

## 7. Permission-Aware Assets

AEKO-721 should support future extensions for:

- gated or private content NFTs
- creator verification
- profile-bound badges
- moderation or compliance freezes

## 8. Compression Direction

Compressed or large-scale social NFT issuance is a future optimization target. The initial reference implementation should focus on correctness and clean state semantics before compressed variants are introduced.

## 9. Security Requirements

The implementation must reject:

- duplicate token ids within a collection
- unauthorized mints
- unauthorized metadata updates
- unauthorized transfers
- invalid royalty configuration

## 10. Implementation Status

- [x] AEKO-721 implementation-facing spec written
- [x] AEKO-721 reference program scaffolded
- [x] Collection state implemented
- [x] NFT mint and transfer logic implemented
- [x] Royalty validation implemented
- [x] Metadata update path implemented
- [x] Freeze and thaw controls implemented
- [x] Web demo supports live reads and wallet-oriented unsigned transaction construction
- [x] Web demo supports seed-based account setup and rent-aware collection/mint preparation
- [x] Web demo uses a typed wallet adapter layer instead of direct provider heuristics
