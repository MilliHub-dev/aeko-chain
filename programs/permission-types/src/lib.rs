#![allow(clippy::arithmetic_side_effects)]

use aeko_sdk::pubkey::Pubkey;

/// Stable native-program identity used by permission-layer programs to
/// authenticate emergency cross-program invocations without dependency cycles.
pub const EMERGENCY_MULTISIG_PROGRAM_ID_BYTES: [u8; 32] = [20u8; 32];

pub fn emergency_multisig_program_id() -> Pubkey {
    Pubkey::new_from_array(EMERGENCY_MULTISIG_PROGRAM_ID_BYTES)
}

pub mod access;
pub mod clearance;
pub mod envelope;
pub mod key;
pub mod role;

pub use access::{AccessDeniedReason, AccessResult};
pub use clearance::{ClearanceSbt, ClearanceTier, IssuerRecord};
pub use envelope::EncryptedPayloadEnvelope;
pub use key::{KeyAlgorithm, KeyState, KeyType};
pub use role::{RoleEntry, WalletRoleAssignment};
