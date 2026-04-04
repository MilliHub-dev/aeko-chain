use {
    crate::error::SocialRewardsError,
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct RewardConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub reward_vault: Pubkey,
    pub settlement_authority: Pubkey,
    pub min_claim_amount: u64,
    pub rewards_enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct CreatorRewardAccount {
    pub creator: Pubkey,
    pub total_earned: u128,
    pub total_claimed: u128,
    pub claimable_amount: u64,
    pub last_settled_epoch: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct CreatorRewardEpochRecord {
    pub epoch: u64,
    pub creator: Pubkey,
    pub earned_points: u128,
    pub reward_amount: u64,
    pub claimed_amount: u64,
    pub penalty_bps: u16,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct CreatorEpochInput {
    pub creator: Pubkey,
    pub earned_points: u128,
    pub penalty_bps: u16,
    pub reputation_multiplier_bps: u16,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct RewardSettlementInput {
    pub epoch: u64,
    pub reward_pool_amount: u64,
    pub creator_entries: Vec<CreatorEpochInput>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct RewardEpochSettlement {
    pub epoch: u64,
    pub reward_pool_amount: u64,
    pub total_effective_points: u128,
    pub settled_creator_count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SocialRewardsStateAccount {
    pub is_initialized: bool,
    pub config: RewardConfig,
    pub creators: Vec<CreatorRewardAccount>,
    pub epochs: Vec<CreatorRewardEpochRecord>,
    pub settlements: Vec<RewardEpochSettlement>,
}

impl SocialRewardsStateAccount {
    pub fn new(config: RewardConfig) -> Self {
        Self {
            is_initialized: true,
            config,
            creators: Vec::new(),
            epochs: Vec::new(),
            settlements: Vec::new(),
        }
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            Ok(())
        } else {
            Err(SocialRewardsError::Uninitialized.into())
        }
    }

    pub fn ensure_authority(&self, authority: &Pubkey) -> Result<(), ProgramError> {
        if *authority == self.config.authority || *authority == self.config.settlement_authority {
            Ok(())
        } else {
            Err(SocialRewardsError::Unauthorized.into())
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

    pub fn epoch_already_settled(&self, epoch: u64) -> bool {
        self.settlements.iter().any(|settlement| settlement.epoch == epoch)
    }
}
