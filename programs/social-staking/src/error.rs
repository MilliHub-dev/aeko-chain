use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
pub enum SocialStakingError {
    Uninitialized = 0,
    Unauthorized = 1,
    StakingDisabled = 2,
    PositionNotFound = 3,
    PositionNotActive = 4,
    CooldownNotReached = 5,
    NothingToClaim = 6,
    PositionAlreadyExists = 7,
    StakeTooLow = 8,
    InvalidUnstakeEpoch = 9,
    InvalidYieldRecord = 10,
}

impl From<SocialStakingError> for ProgramError {
    fn from(error: SocialStakingError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
