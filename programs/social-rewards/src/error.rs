use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
pub enum SocialRewardsError {
    Uninitialized = 0,
    Unauthorized = 1,
    RewardsPaused = 2,
    EpochAlreadyRecorded = 3,
    NothingToClaim = 4,
    InvalidSettlementInput = 5,
    EpochAlreadySettled = 6,
    ClaimBelowMinimum = 7,
}

impl From<SocialRewardsError> for ProgramError {
    fn from(error: SocialRewardsError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
