use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PublicMintError {
    AlreadyInitialized = 0xC001,
    UninitializedState = 0xC002,
    InvalidMintAuthority = 0xC003,
    PolicyDisabled = 0xC004,
    WalletBlocked = 0xC005,
    CooldownActive = 0xC006,
    MintWindowExceeded = 0xC007,
    InvalidSubsidyPolicy = 0xC008,
    AllowlistRequired = 0xC009,
    InvalidTokenomicsState = 0xC00A,
}

impl From<PublicMintError> for ProgramError {
    fn from(error: PublicMintError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
