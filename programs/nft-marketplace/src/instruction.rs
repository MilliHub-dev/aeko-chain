use {
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum NftMarketplaceInstruction {
    /// Create a listing for an NFT.
    ///
    /// Accounts:
    ///   [0] listing_account  — writable, owned by this program (pre-allocated by caller)
    ///   [1] token_account    — readable, token-721 token account (validates seller ownership)
    ///   [2] seller           — signer
    ListNft {
        collection: Pubkey,
        creator: Pubkey,
        price_lamports: u64,
        royalty_bps: u16,
        expires_at_slot: Option<u64>,
    },

    /// Purchase an active listing.
    ///
    /// Accounts:
    ///   [0] listing_account — writable, owned by this program
    ///   [1] buyer           — signer
    ///
    /// Lamport transfers and the token-721 TransferNft instruction must be
    /// included as separate instructions in the same transaction by the caller.
    BuyNft,

    /// Cancel an active listing. Only the original seller may cancel.
    ///
    /// Accounts:
    ///   [0] listing_account — writable, owned by this program
    ///   [1] seller          — signer
    CancelListing,
}

pub fn list_nft(
    program_id: &Pubkey,
    listing_pubkey: &Pubkey,
    token_account_pubkey: &Pubkey,
    seller_pubkey: &Pubkey,
    collection: Pubkey,
    creator: Pubkey,
    price_lamports: u64,
    royalty_bps: u16,
    expires_at_slot: Option<u64>,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &NftMarketplaceInstruction::ListNft {
            collection,
            creator,
            price_lamports,
            royalty_bps,
            expires_at_slot,
        },
        vec![
            AccountMeta::new(*listing_pubkey, false),
            AccountMeta::new_readonly(*token_account_pubkey, false),
            AccountMeta::new_readonly(*seller_pubkey, true),
        ],
    )
}

pub fn buy_nft(
    program_id: &Pubkey,
    listing_pubkey: &Pubkey,
    buyer_pubkey: &Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &NftMarketplaceInstruction::BuyNft,
        vec![
            AccountMeta::new(*listing_pubkey, false),
            AccountMeta::new_readonly(*buyer_pubkey, true),
        ],
    )
}

pub fn cancel_listing(
    program_id: &Pubkey,
    listing_pubkey: &Pubkey,
    seller_pubkey: &Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &NftMarketplaceInstruction::CancelListing,
        vec![
            AccountMeta::new(*listing_pubkey, false),
            AccountMeta::new_readonly(*seller_pubkey, true),
        ],
    )
}
