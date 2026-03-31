use {
    borsh::{BorshDeserialize, BorshSerialize},
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum MintPolicy {
    FixedSupply,
    AuthorityGated,
    EmissionsControlled,
    PublicMintControlled,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct Aeko20Mint {
    pub mint_authority: Option<Pubkey>,
    pub freeze_authority: Option<Pubkey>,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub total_supply: u128,
    pub supply_cap: Option<u128>,
    pub metadata_uri: Option<String>,
    pub transfer_hook_program_id: Option<Pubkey>,
    pub required_clearance: Option<u8>,
    pub mint_policy: MintPolicy,
    pub is_initialized: bool,
}

impl Aeko20Mint {
    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct Aeko20Account {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub balance: u128,
    pub frozen: bool,
}

impl Aeko20Account {
    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct AllowanceRecord {
    pub owner: Pubkey,
    pub spender: Pubkey,
    pub mint: Pubkey,
    pub amount: u128,
    pub expires_at_epoch: Option<u64>,
}

impl AllowanceRecord {
    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }
}
