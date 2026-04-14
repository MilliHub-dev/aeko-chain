use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[allow(dead_code)]
pub enum FinalityOracleError {
    // Initialisation
    AlreadyInitialized = 0,
    Uninitialized = 1,

    // Authority
    Unauthorized = 2,

    // Proof request
    ProofRequestAlreadyExists = 3,
    ProofRequestNotFound = 4,
    InsufficientClearance = 5,
    IssuerNotSubnetMember = 6,

    // Proof verification
    ProofHashMismatch = 7,
    ProofIssuerRevoked = 8,
    ProofNotFound = 9,

    // General
    InvalidAccountData = 10,
    InvalidInstructionData = 11,
}

impl From<FinalityOracleError> for ProgramError {
    fn from(e: FinalityOracleError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
