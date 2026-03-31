#![allow(clippy::arithmetic_side_effects)]

pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

use aeko_program_runtime::declare_process_instruction;
use aeko_sdk::pubkey::Pubkey;

pub const DEFAULT_COMPUTE_UNITS: u64 = 150;
pub const PUBLIC_MINT_PROGRAM_ID_BYTES: [u8; 32] = [9u8; 32];
pub const MAX_BLOCKLISTED_WALLETS: usize = 1024;
pub const MAX_ALLOWLISTED_WALLETS: usize = 4096;

pub fn id() -> Pubkey {
    Pubkey::new_from_array(PUBLIC_MINT_PROGRAM_ID_BYTES)
}

pub fn check_id(program_id: &Pubkey) -> bool {
    *program_id == id()
}

declare_process_instruction!(Entrypoint, DEFAULT_COMPUTE_UNITS, |_invoke_context| {
    processor::Processor::process(_invoke_context)
});
