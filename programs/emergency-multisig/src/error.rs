use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[allow(dead_code)]
pub enum EmergencyMultisigError {
    // Initialisation
    AlreadyInitialized = 0,
    Uninitialized = 1,

    // Authority
    Unauthorized = 2,
    SignerNotMember = 3,

    // Proposal
    ProposalAlreadyExists = 4,
    ProposalNotFound = 5,
    ProposalAlreadyExecuted = 6,
    ProposalExpired = 7,
    ProposalCancelled = 8,
    QuorumNotMet = 9,
    AlreadyApproved = 10,

    // General
    InvalidAccountData = 11,
    InvalidInstructionData = 12,
}

impl From<EmergencyMultisigError> for ProgramError {
    fn from(e: EmergencyMultisigError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
