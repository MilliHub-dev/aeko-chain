use {
    crate::error::SocialMonetizationError,
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum SubscriptionState {
    Active,
    Expired,
    Canceled,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct MonetizationConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub platform_fee_bps: u16,
    pub subscriptions_enabled: bool,
    pub paid_content_enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct CreatorTipRecord {
    pub tip_id: [u8; 32],
    pub creator: Pubkey,
    pub sender: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SubscriptionRecord {
    pub subscription_id: [u8; 32],
    pub creator: Pubkey,
    pub subscriber: Pubkey,
    pub amount_per_period: u64,
    pub period_seconds: u64,
    pub started_at_unix: i64,
    pub valid_until_unix: i64,
    pub state: SubscriptionState,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct PaidContentUnlockRecord {
    pub unlock_id: [u8; 32],
    pub content_id: [u8; 32],
    pub creator: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub unlocked_at_unix: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct CreatorRevenueAccount {
    pub creator: Pubkey,
    pub total_earned: u128,
    pub total_claimed: u128,
    pub claimable_amount: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SocialMonetizationStateAccount {
    pub is_initialized: bool,
    pub config: MonetizationConfig,
    pub tips: Vec<CreatorTipRecord>,
    pub subscriptions: Vec<SubscriptionRecord>,
    pub unlocks: Vec<PaidContentUnlockRecord>,
    pub revenues: Vec<CreatorRevenueAccount>,
}

impl SocialMonetizationStateAccount {
    pub fn new(config: MonetizationConfig) -> Self {
        Self {
            is_initialized: true,
            config,
            tips: Vec::new(),
            subscriptions: Vec::new(),
            unlocks: Vec::new(),
            revenues: Vec::new(),
        }
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            Ok(())
        } else {
            Err(SocialMonetizationError::Uninitialized.into())
        }
    }

    pub fn ensure_authority(&self, authority: &Pubkey) -> Result<(), ProgramError> {
        if *authority == self.config.authority {
            Ok(())
        } else {
            Err(SocialMonetizationError::Unauthorized.into())
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

    pub fn tip_exists(&self, tip_id: &[u8; 32]) -> bool {
        self.tips.iter().any(|tip| &tip.tip_id == tip_id)
    }

    pub fn subscription_exists(&self, subscription_id: &[u8; 32]) -> bool {
        self.subscriptions
            .iter()
            .any(|subscription| &subscription.subscription_id == subscription_id)
    }

    pub fn unlock_exists(&self, unlock_id: &[u8; 32]) -> bool {
        self.unlocks.iter().any(|unlock| &unlock.unlock_id == unlock_id)
    }
}
