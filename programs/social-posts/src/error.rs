use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
pub enum SocialPostsError {
    Uninitialized = 0,
    Unauthorized = 1,
    PostingDisabled = 2,
    EngagementDisabled = 3,
    PostNotFound = 4,
    DuplicatePost = 5,
    DuplicateEngagementProof = 6,
    DuplicateReplayGuard = 7,
    InvalidContentUri = 8,
    InvalidTimestamp = 9,
    InvalidEdit = 10,
}

impl From<SocialPostsError> for ProgramError {
    fn from(error: SocialPostsError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
