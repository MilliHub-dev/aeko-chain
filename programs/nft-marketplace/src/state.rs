use {
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum ListingState {
    Active,
    Sold,
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct NftListing {
    pub seller: Pubkey,
    pub collection: Pubkey,
    pub token_account: Pubkey,
    pub creator: Pubkey,
    pub price_lamports: u64,
    pub royalty_bps: u16,
    pub expires_at_slot: Option<u64>,
    pub state: ListingState,
    pub buyer: Option<Pubkey>,
    pub is_initialized: bool,
}

impl NftListing {
    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }
}
