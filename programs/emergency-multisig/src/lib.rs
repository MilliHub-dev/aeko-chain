#![allow(clippy::arithmetic_side_effects)]

pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

use aeko_program_runtime::declare_process_instruction;
use aeko_sdk::pubkey::Pubkey;

pub use aeko_permission_types::EMERGENCY_MULTISIG_PROGRAM_ID_BYTES;

pub const DEFAULT_COMPUTE_UNITS: u64 = 600;

pub fn id() -> Pubkey {
    aeko_permission_types::emergency_multisig_program_id()
}

pub fn check_id(program_id: &Pubkey) -> bool {
    *program_id == id()
}

declare_process_instruction!(Entrypoint, DEFAULT_COMPUTE_UNITS, |_invoke_context| {
    processor::Processor::process(_invoke_context)
});
