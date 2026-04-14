use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[allow(dead_code)]
pub enum PermissionRegistryError {
    // Initialisation
    AlreadyInitialized = 0,
    Uninitialized = 1,

    // Authority / ownership
    Unauthorized = 2,
    IssuerNotFound = 3,
    IssuerInactive = 4,
    IssuerNotAuthorizedForTier = 5,

    // Clearance SBT
    SbtAlreadyExists = 6,
    SbtNotFound = 7,
    SbtExpired = 8,
    SbtRevoked = 9,
    ClearanceMissing = 10,

    // Role management
    RoleNotFound = 11,
    RoleInactive = 12,
    RoleAlreadyExists = 13,
    ClearanceOutOfRoleRange = 14,

    // Role assignment
    AssignmentNotFound = 15,
    AssignmentAlreadyExists = 16,

    // Access evaluation
    SubnetFrozen = 17,
    SubnetMembershipMissing = 18,
    DenyByDefault = 19,
    RequiresEnclave = 20,

    // Envelope / decryption
    InvalidEnvelopeVersion = 21,
    KeyRevoked = 22,
    KeyNotFound = 23,
    AadMismatch = 24,

    // General
    InvalidAccountData = 25,
    InvalidInstructionData = 26,
}

impl From<PermissionRegistryError> for ProgramError {
    fn from(e: PermissionRegistryError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
