use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[allow(dead_code)]
pub enum SubnetRegistryError {
    // Initialisation
    AlreadyInitialized = 0,
    Uninitialized = 1,

    // Authority
    Unauthorized = 2,

    // Subnet
    SubnetAlreadyExists = 3,
    SubnetNotFound = 4,
    SubnetFrozen = 5,
    SubnetNotFrozen = 6,
    ClearanceBelowMinimum = 7,

    // Membership
    MemberAlreadyExists = 8,
    MemberNotFound = 9,
    MemberKeyRevoked = 10,
    ValidatorSetFull = 11,

    // General
    InvalidAccountData = 12,
    InvalidInstructionData = 13,
}

impl From<SubnetRegistryError> for ProgramError {
    fn from(e: SubnetRegistryError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
