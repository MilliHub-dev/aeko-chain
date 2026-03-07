use {
    crate::{
        args::{DistributeTokensArgs, SplTokenArgs},
        commands::{get_fee_estimate_for_messages, Error, FundingSource, TypedAllocation},
    },
    console::style,
    aeko_account_decoder::parse_token::{real_number_string, real_number_string_trimmed},
    aeko_rpc_client::rpc_client::RpcClient,
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        message::Message,
        native_token::lamports_to_aeko,
        program_error::ProgramError,
        pubkey::Pubkey,
    },
    spl_associated_token_account::{
        get_associated_token_address, instruction::create_associated_token_account,
    },
    spl_token::{
        solana_program::{
            instruction::Instruction as SplInstruction,
            program_error::ProgramError as SplProgramError,
            program_pack::Pack,
            pubkey::Pubkey as SplPubkey,
        },
        state::{Account as SplTokenAccount, Mint},
    },
};

fn aeko_to_spl_pubkey(pubkey: &Pubkey) -> SplPubkey {
    SplPubkey::new_from_array(pubkey.to_bytes())
}

fn spl_to_aeko_pubkey(pubkey: &SplPubkey) -> Pubkey {
    Pubkey::new_from_array(pubkey.to_bytes())
}

fn spl_to_aeko_instruction(instruction: SplInstruction) -> Instruction {
    Instruction {
        program_id: spl_to_aeko_pubkey(&instruction.program_id),
        accounts: instruction
            .accounts
            .into_iter()
            .map(|meta| AccountMeta {
                pubkey: spl_to_aeko_pubkey(&meta.pubkey),
                is_signer: meta.is_signer,
                is_writable: meta.is_writable,
            })
            .collect(),
        data: instruction.data,
    }
}

fn map_spl_program_error(_: SplProgramError) -> Error {
    Error::ProgramError(ProgramError::InvalidAccountData)
}

pub fn update_token_args(client: &RpcClient, args: &mut Option<SplTokenArgs>) -> Result<(), Error> {
    if let Some(spl_token_args) = args {
        let sender_account = client
            .get_account(&spl_token_args.token_account_address)
            .unwrap_or_default();
        let sender_token =
            SplTokenAccount::unpack(&sender_account.data).map_err(map_spl_program_error)?;
        spl_token_args.mint = spl_to_aeko_pubkey(&sender_token.mint);
        update_decimals(client, args)?;
    }
    Ok(())
}

pub fn update_decimals(client: &RpcClient, args: &mut Option<SplTokenArgs>) -> Result<(), Error> {
    if let Some(spl_token_args) = args {
        let mint_account = client.get_account(&spl_token_args.mint).unwrap_or_default();
        let mint = Mint::unpack(&mint_account.data).map_err(map_spl_program_error)?;
        spl_token_args.decimals = mint.decimals;
    }
    Ok(())
}

pub(crate) fn build_spl_token_instructions(
    allocation: &TypedAllocation,
    args: &DistributeTokensArgs,
    do_create_associated_token_account: bool,
) -> Vec<Instruction> {
    let spl_token_args = args
        .spl_token_args
        .as_ref()
        .expect("spl_token_args must be some");
    let wallet_address = allocation.recipient;
    let wallet_address_spl = aeko_to_spl_pubkey(&wallet_address);
    let mint_spl = aeko_to_spl_pubkey(&spl_token_args.mint);
    let token_account_spl = aeko_to_spl_pubkey(&spl_token_args.token_account_address);
    let sender_pubkey_spl = aeko_to_spl_pubkey(&args.sender_keypair.pubkey());
    let associated_token_address_spl = get_associated_token_address(&wallet_address_spl, &mint_spl);
    let mut instructions = vec![];
    if do_create_associated_token_account {
        let instruction = create_associated_token_account(
            &aeko_to_spl_pubkey(&args.fee_payer.pubkey()),
            &wallet_address_spl,
            &mint_spl,
            &spl_token::id(),
        );
        instructions.push(spl_to_aeko_instruction(instruction));
    }
    let instruction = spl_token::instruction::transfer_checked(
        &spl_token::id(),
        &token_account_spl,
        &mint_spl,
        &associated_token_address_spl,
        &sender_pubkey_spl,
        &[],
        allocation.amount,
        spl_token_args.decimals,
    )
    .unwrap();
    instructions.push(spl_to_aeko_instruction(instruction));
    instructions
}

pub(crate) fn check_spl_token_balances(
    messages: &[Message],
    allocations: &[TypedAllocation],
    client: &RpcClient,
    args: &DistributeTokensArgs,
    created_accounts: u64,
) -> Result<(), Error> {
    let spl_token_args = args
        .spl_token_args
        .as_ref()
        .expect("spl_token_args must be some");
    let allocation_amount: u64 = allocations.iter().map(|x| x.amount).sum();
    let fees = get_fee_estimate_for_messages(messages, client)?;

    let token_account_rent_exempt_balance =
        client.get_minimum_balance_for_rent_exemption(SplTokenAccount::LEN)?;
    let account_creation_amount = created_accounts * token_account_rent_exempt_balance;
    let fee_payer_balance = client.get_balance(&args.fee_payer.pubkey())?;
    if fee_payer_balance < fees + account_creation_amount {
        return Err(Error::InsufficientFunds(
                    vec![FundingSource::FeePayer].into(),
                    lamports_to_aeko(fees + account_creation_amount).to_string(),
                ));
    }
    let source_token_account = client
        .get_account(&spl_token_args.token_account_address)
        .unwrap_or_default();
    let source_token = SplTokenAccount::unpack(&source_token_account.data)
        .map_err(map_spl_program_error)?;
    if source_token.amount < allocation_amount {
        return Err(Error::InsufficientFunds(
            vec![FundingSource::SplTokenAccount].into(),
            real_number_string_trimmed(allocation_amount, spl_token_args.decimals),
        ));
    }
    Ok(())
}

pub(crate) fn print_token_balances(
    client: &RpcClient,
    allocation: &TypedAllocation,
    spl_token_args: &SplTokenArgs,
) -> Result<(), Error> {
    let address = allocation.recipient;
    let expected = allocation.amount;
    let associated_token_address = spl_to_aeko_pubkey(&get_associated_token_address(
        &aeko_to_spl_pubkey(&address),
        &aeko_to_spl_pubkey(&spl_token_args.mint),
    ));
    let recipient_account = client
        .get_account(&associated_token_address)
        .unwrap_or_default();
    let (actual, difference) = if let Ok(recipient_token) =
        SplTokenAccount::unpack(&recipient_account.data)
    {
        let actual_ui_amount = real_number_string(recipient_token.amount, spl_token_args.decimals);
        let delta_string =
            real_number_string(recipient_token.amount - expected, spl_token_args.decimals);
        (
            style(format!("{actual_ui_amount:>24}")),
            format!("{delta_string:>24}"),
        )
    } else {
        (
            style("Associated token account not yet created".to_string()).yellow(),
            "".to_string(),
        )
    };
    println!(
        "{:<44}  {:>24}  {:>24}  {:>24}",
        allocation.recipient,
        real_number_string(expected, spl_token_args.decimals),
        actual,
        difference,
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    // The following unit tests were written for v1.4 using the ProgramTest framework, passing its
    // BanksClient into the `solana-tokens` methods. With the revert to RpcClient in this module
    // (https://github.com/aeko-chain/solana/pull/13623), that approach was no longer viable.
    // These tests were removed rather than rewritten to avoid accruing technical debt. Once a new
    // rpc/client framework is implemented, they should be restored.
    //
    // async fn test_process_spl_token_allocations()
    // async fn test_process_spl_token_transfer_amount_allocations()
    // async fn test_check_spl_token_balances()
    //
    // https://github.com/aeko-chain/solana/blob/5511d52c6284013a24ced10966d11d8f4585799e/tokens/src/spl_token.rs#L490-L685
}
