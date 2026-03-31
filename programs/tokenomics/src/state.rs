use {
    crate::{
        error::TokenomicsError, EmissionState, PendingGovernanceUpdate, SubsidizedApp,
        SupplyState, TokenomicsConfig, ValidatorEpochReward, VestingPolicy,
    },
    borsh::{BorshDeserialize, BorshSerialize},
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct TokenomicsStateAccount {
    pub config: TokenomicsConfig,
    pub supply: SupplyState,
    pub emission: EmissionState,
    pub team_vesting: VestingPolicy,
    pub pending_updates: Vec<PendingGovernanceUpdate>,
    pub subsidized_apps: Vec<SubsidizedApp>,
    pub recent_rewards: Vec<ValidatorEpochReward>,
    pub is_initialized: bool,
}

impl TokenomicsStateAccount {
    pub fn signed_off_defaults(
        authority: Pubkey,
        treasury_account: Pubkey,
        validator_rewards_account: Pubkey,
        community_rewards_account: Pubkey,
        governance_program_id: Pubkey,
        slash_destination: Pubkey,
        base_fee_atomic: u64,
    ) -> Self {
        Self {
            config: TokenomicsConfig::signed_off_defaults(
                authority,
                treasury_account,
                validator_rewards_account,
                community_rewards_account,
                governance_program_id,
                slash_destination,
                base_fee_atomic,
            ),
            supply: SupplyState::signed_off_defaults(),
            emission: EmissionState::signed_off_defaults(),
            team_vesting: VestingPolicy::signed_off_team_policy(),
            pending_updates: Vec::new(),
            subsidized_apps: Vec::new(),
            recent_rewards: Vec::new(),
            is_initialized: true,
        }
    }

    pub fn ensure_can_update(&self, caller: &Pubkey) -> Result<(), ProgramError> {
        if &self.config.governance_program_id != caller && &self.config.authority != caller {
            return Err(TokenomicsError::InvalidGovernanceAuthority.into());
        }
        Ok(())
    }

    pub fn ensure_uninitialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            return Err(TokenomicsError::AlreadyInitialized.into());
        }
        Ok(())
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if !self.is_initialized {
            return Err(TokenomicsError::UninitializedState.into());
        }
        Ok(())
    }

    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn push_recorded_reward(&mut self, reward: ValidatorEpochReward) {
        self.recent_rewards.push(reward);
        if self.recent_rewards.len() > crate::MAX_RECORDED_VALIDATOR_REWARDS {
            let overflow = self
                .recent_rewards
                .len()
                .saturating_sub(crate::MAX_RECORDED_VALIDATOR_REWARDS);
            self.recent_rewards.drain(0..overflow);
        }
    }
}
