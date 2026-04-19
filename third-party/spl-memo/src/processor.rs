//! Program state processor

use {
    aeko_program::{
        account_info::AccountInfo, entrypoint::ProgramResult, msg, program_error::ProgramError,
        pubkey::Pubkey,
    },
    std::str::from_utf8,
};

/// Instruction processor
pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    input: &[u8],
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let mut missing_required_signature = false;
    for account_info in account_info_iter {
        if let Some(address) = account_info.signer_key() {
            msg!("Signed by {:?}", address);
        } else {
            missing_required_signature = true;
        }
    }
    if missing_required_signature {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let memo = from_utf8(input).map_err(|err| {
        msg!("Invalid UTF-8, from byte {}", err.valid_up_to());
        ProgramError::InvalidInstructionData
    })?;
    msg!("Memo (len {}): {:?}", memo.len(), memo);

    Ok(())
}
