use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Token20Error {
    AlreadyInitialized = 0xB001,
    UninitializedState = 0xB002,
    InvalidMintAuthority = 0xB003,
    InvalidTokenOwner = 0xB004,
    InsufficientBalance = 0xB005,
    AllowanceExceeded = 0xB006,
    AccountFrozen = 0xB007,
}

impl From<Token20Error> for ProgramError {
    fn from(error: Token20Error) -> Self {
        ProgramError::Custom(error as u32)
    }
}
