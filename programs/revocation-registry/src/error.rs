use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[allow(dead_code)]
pub enum RevocationRegistryError {
    // Initialisation
    AlreadyInitialized = 0,
    Uninitialized = 1,

    // Authority
    Unauthorized = 2,

    // Key record
    KeyAlreadyExists = 3,
    KeyNotFound = 4,
    KeyAlreadyTerminal = 5,
    InvalidStateTransition = 6,

    // Rotation
    RotationIntentNotFound = 7,
    RotationAlreadyApproved = 8,
    QuorumNotMet = 9,
    RotationExpired = 10,
    SuccessorKeyMissing = 11,

    // General
    InvalidAccountData = 12,
    InvalidInstructionData = 13,
}

impl From<RevocationRegistryError> for ProgramError {
    fn from(e: RevocationRegistryError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
