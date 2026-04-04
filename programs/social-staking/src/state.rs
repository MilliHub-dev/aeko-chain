use {
    crate::error::SocialStakingError,
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SocialStakeConfig {
    pub authority: Pubkey,
    pub stake_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub min_stake_amount: u64,
    pub cooldown_epochs: u64,
    pub staking_enabled: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum SocialStakeState {
    Active,
    CoolingDown,
    Closed,
    Slashed,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SocialStakePosition {
    pub position_id: [u8; 32],
    pub staker: Pubkey,
    pub creator: Pubkey,
    pub staked_amount: u64,
    pub activated_at_epoch: u64,
    pub unlock_epoch: Option<u64>,
    pub accumulated_yield: u64,
    pub claimed_yield: u64,
    pub state: SocialStakeState,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct StakeYieldRecord {
    pub epoch: u64,
    pub position_id: [u8; 32],
    pub creator: Pubkey,
    pub staker: Pubkey,
    pub yield_amount: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SocialStakingStateAccount {
    pub is_initialized: bool,
    pub config: SocialStakeConfig,
    pub positions: Vec<SocialStakePosition>,
    pub yield_records: Vec<StakeYieldRecord>,
}

impl SocialStakingStateAccount {
    pub fn new(config: SocialStakeConfig) -> Self {
        Self {
            is_initialized: true,
            config,
            positions: Vec::new(),
            yield_records: Vec::new(),
        }
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            Ok(())
        } else {
            Err(SocialStakingError::Uninitialized.into())
        }
    }

    pub fn ensure_authority(&self, authority: &Pubkey) -> Result<(), ProgramError> {
        if *authority == self.config.authority {
            Ok(())
        } else {
            Err(SocialStakingError::Unauthorized.into())
        }
    }

    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let end = data
            .iter()
            .rposition(|byte| *byte != 0)
            .map(|index| index + 1)
            .unwrap_or(0);
        Self::try_from_slice(&data[..end]).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn position_exists(&self, position_id: &[u8; 32]) -> bool {
        self.positions
            .iter()
            .any(|position| &position.position_id == position_id)
    }
}
