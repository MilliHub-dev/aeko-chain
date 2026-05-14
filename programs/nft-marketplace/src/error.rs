use aeko_sdk::program_error::ProgramError;

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarketplaceError {
    ListingNotActive = 0xE001,
    InvalidSeller = 0xE002,
    ListingExpired = 0xE003,
    InvalidPrice = 0xE004,
    InvalidRoyalty = 0xE005,
    TokenNotOwnedBySeller = 0xE006,
}

impl From<MarketplaceError> for ProgramError {
    fn from(error: MarketplaceError) -> Self {
        ProgramError::Custom(error as u32)
    }
}
