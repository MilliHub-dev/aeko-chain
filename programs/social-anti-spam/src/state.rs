use {
    crate::error::SocialAntiSpamError,
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum AntiSpamMode {
    ObserveOnly,
    GateByReputation,
    GateByStake,
    PenaltyEnabled,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct AntiSpamConfig {
    pub authority: Pubkey,
    pub mode: AntiSpamMode,
    pub min_post_stake: u64,
    pub min_post_reputation: u16,
    pub cooldown_epochs: u64,
    pub slash_bps: u16,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct AntiSpamProfile {
    pub wallet: Pubkey,
    pub post_count_window: u32,
    pub engagement_count_window: u32,
    pub spam_flags: u16,
    pub gated_until_epoch: Option<u64>,
    pub slash_count: u16,
    pub last_flagged_at_unix: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SocialAntiSpamStateAccount {
    pub is_initialized: bool,
    pub config: AntiSpamConfig,
    pub profiles: Vec<AntiSpamProfile>,
}

impl SocialAntiSpamStateAccount {
    pub fn new(config: AntiSpamConfig) -> Self {
        Self {
            is_initialized: true,
            config,
            profiles: Vec::new(),
        }
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            Ok(())
        } else {
            Err(SocialAntiSpamError::Uninitialized.into())
        }
    }

    pub fn ensure_authority(&self, authority: &Pubkey) -> Result<(), ProgramError> {
        if *authority == self.config.authority {
            Ok(())
        } else {
            Err(SocialAntiSpamError::Unauthorized.into())
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

    pub fn profile_for_wallet(&self, wallet: &Pubkey) -> Option<&AntiSpamProfile> {
        self.profiles.iter().find(|profile| &profile.wallet == wallet)
    }
}
