use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
pub enum SocialAntiSpamError {
    Uninitialized = 0,
    Unauthorized = 1,
    NotAllowedByMode = 2,
    ReputationTooLow = 3,
    StakeTooLow = 4,
    CooldownActive = 5,
    ProfileNotFound = 6,
}

impl From<SocialAntiSpamError> for ProgramError {
    fn from(error: SocialAntiSpamError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
