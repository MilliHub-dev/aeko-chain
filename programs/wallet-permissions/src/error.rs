use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WalletPermissionsError {
    AlreadyInitialized = 0xD001,
    UninitializedState = 0xD002,
    InvalidOwner = 0xD003,
    WalletFrozen = 0xD004,
    DelegateNotFound = 0xD005,
    InvalidDelegateWindow = 0xD006,
    AuditLogFull = 0xD007,
    SpendLimitExceeded = 0xD008,
    ProgramNotAllowed = 0xD009,
    TokenNotAllowed = 0xD00A,
    DelegateInactive = 0xD00B,
}

impl From<WalletPermissionsError> for ProgramError {
    fn from(error: WalletPermissionsError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
