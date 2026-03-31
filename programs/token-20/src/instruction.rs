use {
    crate::state::MintPolicy,
    borsh::{BorshDeserialize, BorshSerialize},
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum Token20Instruction {
    InitializeMint {
        name: String,
        symbol: String,
        decimals: u8,
        supply_cap: Option<u128>,
        metadata_uri: Option<String>,
        mint_policy: MintPolicy,
    },
    InitializeAccount,
    MintTo {
        amount: u128,
    },
    MintPublicTo {
        amount: u128,
    },
    MintEmissionsTo {
        amount: u128,
    },
    Transfer {
        amount: u128,
    },
    Burn {
        amount: u128,
    },
    Approve {
        amount: u128,
        expires_at_epoch: Option<u64>,
    },
    Revoke,
    TransferFrom {
        amount: u128,
    },
    FreezeAccount,
    ThawAccount,
    SetMintAuthority {
        new_authority: Option<Pubkey>,
    },
}

pub fn initialize_mint(
    program_id: &Pubkey,
    mint_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    name: String,
    symbol: String,
    decimals: u8,
    supply_cap: Option<u128>,
    metadata_uri: Option<String>,
    mint_policy: MintPolicy,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::InitializeMint {
            name,
            symbol,
            decimals,
            supply_cap,
            metadata_uri,
            mint_policy,
        },
        vec![
            AccountMeta::new(*mint_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn initialize_account(
    program_id: &Pubkey,
    token_account_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    mint_pubkey: &Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::InitializeAccount,
        vec![
            AccountMeta::new(*token_account_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
            AccountMeta::new_readonly(*mint_pubkey, false),
        ],
    )
}

pub fn mint_to(
    program_id: &Pubkey,
    mint_pubkey: &Pubkey,
    destination_pubkey: &Pubkey,
    mint_authority_pubkey: &Pubkey,
    amount: u128,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::MintTo { amount },
        vec![
            AccountMeta::new(*mint_pubkey, false),
            AccountMeta::new(*destination_pubkey, false),
            AccountMeta::new_readonly(*mint_authority_pubkey, true),
        ],
    )
}

pub fn mint_public_to(
    program_id: &Pubkey,
    mint_pubkey: &Pubkey,
    destination_pubkey: &Pubkey,
    public_mint_state_pubkey: &Pubkey,
    mint_authority_pubkey: &Pubkey,
    amount: u128,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::MintPublicTo { amount },
        vec![
            AccountMeta::new(*mint_pubkey, false),
            AccountMeta::new(*destination_pubkey, false),
            AccountMeta::new_readonly(*public_mint_state_pubkey, false),
            AccountMeta::new_readonly(*mint_authority_pubkey, true),
        ],
    )
}

pub fn transfer(
    program_id: &Pubkey,
    source_pubkey: &Pubkey,
    destination_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    amount: u128,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::Transfer { amount },
        vec![
            AccountMeta::new(*source_pubkey, false),
            AccountMeta::new(*destination_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn mint_emissions_to(
    program_id: &Pubkey,
    mint_pubkey: &Pubkey,
    destination_pubkey: &Pubkey,
    tokenomics_state_pubkey: &Pubkey,
    governance_authority_pubkey: &Pubkey,
    amount: u128,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::MintEmissionsTo { amount },
        vec![
            AccountMeta::new(*mint_pubkey, false),
            AccountMeta::new(*destination_pubkey, false),
            AccountMeta::new_readonly(*tokenomics_state_pubkey, false),
            AccountMeta::new_readonly(*governance_authority_pubkey, true),
        ],
    )
}

pub fn burn(
    program_id: &Pubkey,
    mint_pubkey: &Pubkey,
    source_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    amount: u128,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::Burn { amount },
        vec![
            AccountMeta::new(*mint_pubkey, false),
            AccountMeta::new(*source_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn approve(
    program_id: &Pubkey,
    allowance_pubkey: &Pubkey,
    source_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    spender_pubkey: &Pubkey,
    amount: u128,
    expires_at_epoch: Option<u64>,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::Approve {
            amount,
            expires_at_epoch,
        },
        vec![
            AccountMeta::new(*allowance_pubkey, false),
            AccountMeta::new_readonly(*source_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
            AccountMeta::new_readonly(*spender_pubkey, false),
        ],
    )
}

pub fn revoke(
    program_id: &Pubkey,
    allowance_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::Revoke,
        vec![
            AccountMeta::new(*allowance_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn transfer_from(
    program_id: &Pubkey,
    allowance_pubkey: &Pubkey,
    source_pubkey: &Pubkey,
    destination_pubkey: &Pubkey,
    spender_pubkey: &Pubkey,
    amount: u128,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::TransferFrom { amount },
        vec![
            AccountMeta::new(*allowance_pubkey, false),
            AccountMeta::new(*source_pubkey, false),
            AccountMeta::new(*destination_pubkey, false),
            AccountMeta::new_readonly(*spender_pubkey, true),
        ],
    )
}

pub fn freeze_account(
    program_id: &Pubkey,
    mint_pubkey: &Pubkey,
    token_account_pubkey: &Pubkey,
    freeze_authority_pubkey: &Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::FreezeAccount,
        vec![
            AccountMeta::new_readonly(*mint_pubkey, false),
            AccountMeta::new(*token_account_pubkey, false),
            AccountMeta::new_readonly(*freeze_authority_pubkey, true),
        ],
    )
}

pub fn thaw_account(
    program_id: &Pubkey,
    mint_pubkey: &Pubkey,
    token_account_pubkey: &Pubkey,
    freeze_authority_pubkey: &Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::ThawAccount,
        vec![
            AccountMeta::new_readonly(*mint_pubkey, false),
            AccountMeta::new(*token_account_pubkey, false),
            AccountMeta::new_readonly(*freeze_authority_pubkey, true),
        ],
    )
}

pub fn set_mint_authority(
    program_id: &Pubkey,
    mint_pubkey: &Pubkey,
    current_authority_pubkey: &Pubkey,
    new_authority: Option<Pubkey>,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &Token20Instruction::SetMintAuthority { new_authority },
        vec![
            AccountMeta::new(*mint_pubkey, false),
            AccountMeta::new_readonly(*current_authority_pubkey, true),
        ],
    )
}
