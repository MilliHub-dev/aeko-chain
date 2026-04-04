use {
    crate::state::{CreatorRewardEpochRecord, RewardSettlementInput, SocialRewardsStateAccount},
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum SocialRewardsInstruction {
    InitializeConfig {
        state: SocialRewardsStateAccount,
    },
    SettleRewardEpoch {
        input: RewardSettlementInput,
    },
    RecordRewardEpoch {
        record: CreatorRewardEpochRecord,
    },
    ClaimCreatorReward {
        creator: Pubkey,
        amount: u64,
    },
    ReadRewardState {
        creator: Option<Pubkey>,
    },
}

pub fn initialize_config(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    payer_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    state: SocialRewardsStateAccount,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialRewardsInstruction::InitializeConfig { state },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*payer_pubkey, true),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn settle_reward_epoch(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    input: RewardSettlementInput,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialRewardsInstruction::SettleRewardEpoch { input },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn record_reward_epoch(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    record: CreatorRewardEpochRecord,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialRewardsInstruction::RecordRewardEpoch { record },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn claim_creator_reward(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    creator: Pubkey,
    amount: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialRewardsInstruction::ClaimCreatorReward { creator, amount },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn read_reward_state(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    creator: Option<Pubkey>,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialRewardsInstruction::ReadRewardState { creator },
        vec![AccountMeta::new_readonly(*state_pubkey, false)],
    )
}
