use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TokenomicsError {
    InvalidGovernanceAuthority = 0xA001,
    AlreadyInitialized = 0xA002,
    UninitializedState = 0xA003,
    InvalidGovernableField = 0xA004,
    InvalidFeeConfiguration = 0xA005,
    EpochAlreadySettled = 0xA006,
    InvalidEpoch = 0xA007,
    InvalidCommission = 0xA008,
    InvalidStakeWeight = 0xA009,
}

impl From<TokenomicsError> for ProgramError {
    fn from(error: TokenomicsError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
