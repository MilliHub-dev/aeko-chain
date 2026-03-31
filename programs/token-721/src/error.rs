use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Token721Error {
    AccountFrozen = 0xD001,
    InvalidOwner = 0xD002,
    InvalidRoyalty = 0xD003,
    DuplicateTokenId = 0xD004,
    InvalidMetadata = 0xD005,
}

impl From<Token721Error> for ProgramError {
    fn from(error: Token721Error) -> Self {
        ProgramError::Custom(error as u32)
    }
}
