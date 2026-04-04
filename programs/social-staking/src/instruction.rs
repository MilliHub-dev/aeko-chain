use {
    crate::state::{SocialStakePosition, SocialStakingStateAccount, StakeYieldRecord},
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum SocialStakingInstruction {
    InitializeConfig {
        state: SocialStakingStateAccount,
    },
    OpenPosition {
        position: SocialStakePosition,
    },
    RequestUnstake {
        position_id: [u8; 32],
        unlock_epoch: u64,
    },
    FinalizeUnstake {
        position_id: [u8; 32],
        current_epoch: u64,
    },
    RecordStakeYield {
        record: StakeYieldRecord,
    },
    ClaimStakeYield {
        position_id: [u8; 32],
        amount: u64,
    },
    ReadPosition {
        position_id: Option<[u8; 32]>,
    },
}

pub fn initialize_config(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    payer_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    state: SocialStakingStateAccount,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialStakingInstruction::InitializeConfig { state },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*payer_pubkey, true),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn open_position(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    staker_pubkey: &Pubkey,
    position: SocialStakePosition,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialStakingInstruction::OpenPosition { position },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*staker_pubkey, true),
        ],
    )
}

pub fn request_unstake(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    staker_pubkey: &Pubkey,
    position_id: [u8; 32],
    unlock_epoch: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialStakingInstruction::RequestUnstake {
            position_id,
            unlock_epoch,
        },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*staker_pubkey, true),
        ],
    )
}

pub fn finalize_unstake(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    staker_pubkey: &Pubkey,
    position_id: [u8; 32],
    current_epoch: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialStakingInstruction::FinalizeUnstake {
            position_id,
            current_epoch,
        },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*staker_pubkey, true),
        ],
    )
}

pub fn record_stake_yield(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    record: StakeYieldRecord,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialStakingInstruction::RecordStakeYield { record },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn claim_stake_yield(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    staker_pubkey: &Pubkey,
    position_id: [u8; 32],
    amount: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialStakingInstruction::ClaimStakeYield { position_id, amount },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*staker_pubkey, true),
        ],
    )
}

pub fn read_position(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    position_id: Option<[u8; 32]>,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialStakingInstruction::ReadPosition { position_id },
        vec![AccountMeta::new_readonly(*state_pubkey, false)],
    )
}
