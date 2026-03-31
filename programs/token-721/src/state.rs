use {
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct MetadataAttribute {
    pub trait_type: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct NftMetadata {
    pub name: String,
    pub description: Option<String>,
    pub uri: String,
    pub image_uri: Option<String>,
    pub attributes: Vec<MetadataAttribute>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct Aeko721Collection {
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub base_uri: Option<String>,
    pub total_minted: u64,
    pub is_initialized: bool,
}

impl Aeko721Collection {
    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
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

impl Aeko721Token {
    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }
}
