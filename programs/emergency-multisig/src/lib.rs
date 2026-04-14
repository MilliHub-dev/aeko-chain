#![allow(clippy::arithmetic_side_effects)]

pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

use aeko_program_runtime::declare_process_instruction;
use aeko_sdk::pubkey::Pubkey;

pub const DEFAULT_COMPUTE_UNITS: u64 = 600;

/// Unique program ID for the emergency-multisig.
pub const EMERGENCY_MULTISIG_PROGRAM_ID_BYTES: [u8; 32] = [20u8; 32];

pub fn id() -> Pubkey {
    Pubkey::new_from_array(EMERGENCY_MULTISIG_PROGRAM_ID_BYTES)
}

pub fn check_id(program_id: &Pubkey) -> bool {
    *program_id == id()
}

declare_process_instruction!(Entrypoint, DEFAULT_COMPUTE_UNITS, |_invoke_context| {
    processor::Processor::process(_invoke_context)
});
