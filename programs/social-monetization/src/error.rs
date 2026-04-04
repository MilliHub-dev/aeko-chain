use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
pub enum SocialMonetizationError {
    Uninitialized = 0,
    Unauthorized = 1,
    SubscriptionsDisabled = 2,
    PaidContentDisabled = 3,
    SubscriptionNotFound = 4,
    NothingToClaim = 5,
    InvalidAmount = 6,
    DuplicateTip = 7,
    DuplicateSubscription = 8,
    DuplicateUnlock = 9,
    SubscriptionNotActive = 10,
    InvalidSubscriptionWindow = 11,
}

impl From<SocialMonetizationError> for ProgramError {
    fn from(error: SocialMonetizationError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
