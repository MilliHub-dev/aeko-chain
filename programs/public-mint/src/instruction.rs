use {
    crate::state::{PublicMintPolicy, PublicMintState},
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum PublicMintInstruction {
    InitializePolicy {
        state: PublicMintState,
    },
    UpdatePolicy {
        policy: PublicMintPolicy,
    },
    AddToBlocklist {
        wallet: Pubkey,
    },
    RemoveFromBlocklist {
        wallet: Pubkey,
    },
    AddToAllowlist {
        wallet: Pubkey,
    },
    RemoveFromAllowlist {
        wallet: Pubkey,
    },
    PublicMint {
        current_epoch: u64,
        amount: u128,
        app_id: Option<Pubkey>,
        requested_subsidy: u128,
    },
}

pub fn initialize_policy(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    state: PublicMintState,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PublicMintInstruction::InitializePolicy { state },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn public_mint(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    mint_pubkey: &Pubkey,
    destination_token_account_pubkey: &Pubkey,
    tokenomics_state_pubkey: &Pubkey,
    wallet_pubkey: &Pubkey,
    wallet_authority_pubkey: &Pubkey,
    mint_authority_pubkey: &Pubkey,
    current_epoch: u64,
    amount: u128,
    app_id: Option<Pubkey>,
    requested_subsidy: u128,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PublicMintInstruction::PublicMint {
            current_epoch,
            amount,
            app_id,
            requested_subsidy,
        },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*mint_pubkey, false),
            AccountMeta::new(*destination_token_account_pubkey, false),
            AccountMeta::new_readonly(*tokenomics_state_pubkey, false),
            AccountMeta::new_readonly(*wallet_pubkey, false),
            AccountMeta::new_readonly(*wallet_authority_pubkey, true),
            AccountMeta::new_readonly(*mint_authority_pubkey, true),
        ],
    )
}

pub fn update_policy(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    policy: PublicMintPolicy,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PublicMintInstruction::UpdatePolicy { policy },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn add_to_blocklist(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    wallet: Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PublicMintInstruction::AddToBlocklist { wallet },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn remove_from_blocklist(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    wallet: Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PublicMintInstruction::RemoveFromBlocklist { wallet },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn add_to_allowlist(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    wallet: Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PublicMintInstruction::AddToAllowlist { wallet },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn remove_from_allowlist(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    wallet: Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &PublicMintInstruction::RemoveFromAllowlist { wallet },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}
