use {
    crate::state::NftMetadata,
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum Token721Instruction {
    InitializeCollection {
        name: String,
        symbol: String,
        base_uri: Option<String>,
    },
    MintNft {
        token_id: u64,
        owner: Pubkey,
        creator: Pubkey,
        royalty_bps: u16,
        metadata: NftMetadata,
    },
    FreezeNft,
    ThawNft,
    TransferNft {
        new_owner: Pubkey,
    },
    UpdateMetadata {
        metadata: NftMetadata,
    },
}

pub fn initialize_collection(
    program_id: &Pubkey,
    collection_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    name: String,
    symbol: String,
    base_uri: Option<String>,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token721Instruction::InitializeCollection {
            name,
            symbol,
            base_uri,
        },
        vec![
            AccountMeta::new(*collection_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn mint_nft(
    program_id: &Pubkey,
    collection_pubkey: &Pubkey,
    token_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    token_id: u64,
    owner: Pubkey,
    creator: Pubkey,
    royalty_bps: u16,
    metadata: NftMetadata,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token721Instruction::MintNft {
            token_id,
            owner,
            creator,
            royalty_bps,
            metadata,
        },
        vec![
            AccountMeta::new(*collection_pubkey, false),
            AccountMeta::new(*token_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn transfer_nft(
    program_id: &Pubkey,
    token_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    new_owner: Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token721Instruction::TransferNft { new_owner },
        vec![
            AccountMeta::new(*token_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn freeze_nft(
    program_id: &Pubkey,
    token_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token721Instruction::FreezeNft,
        vec![
            AccountMeta::new(*token_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn thaw_nft(
    program_id: &Pubkey,
    token_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token721Instruction::ThawNft,
        vec![
            AccountMeta::new(*token_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn update_metadata(
    program_id: &Pubkey,
    token_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    metadata: NftMetadata,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token721Instruction::UpdateMetadata { metadata },
        vec![
            AccountMeta::new(*token_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}
