use {
    crate::state::SocialAntiSpamStateAccount,
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum SocialAntiSpamInstruction {
    InitializeConfig {
        state: SocialAntiSpamStateAccount,
    },
    CheckPostEligibility {
        wallet: Pubkey,
        current_epoch: u64,
        reputation_score: u16,
        staked_amount: u64,
    },
    CheckEngagementEligibility {
        wallet: Pubkey,
        current_epoch: u64,
        reputation_score: u16,
        staked_amount: u64,
    },
    FlagSpamBehavior {
        wallet: Pubkey,
        timestamp: i64,
    },
    ApplyCooldown {
        wallet: Pubkey,
        gated_until_epoch: u64,
    },
    ClearCooldown {
        wallet: Pubkey,
    },
    ApplySpamPenalty {
        wallet: Pubkey,
    },
    ReadAntiSpamProfile {
        wallet: Option<Pubkey>,
    },
}

pub fn initialize_config(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    payer_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    state: SocialAntiSpamStateAccount,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialAntiSpamInstruction::InitializeConfig { state },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*payer_pubkey, true),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn check_post_eligibility(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    wallet: Pubkey,
    current_epoch: u64,
    reputation_score: u16,
    staked_amount: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialAntiSpamInstruction::CheckPostEligibility {
            wallet,
            current_epoch,
            reputation_score,
            staked_amount,
        },
        vec![AccountMeta::new_readonly(*state_pubkey, false)],
    )
}

pub fn check_engagement_eligibility(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    wallet: Pubkey,
    current_epoch: u64,
    reputation_score: u16,
    staked_amount: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialAntiSpamInstruction::CheckEngagementEligibility {
            wallet,
            current_epoch,
            reputation_score,
            staked_amount,
        },
        vec![AccountMeta::new_readonly(*state_pubkey, false)],
    )
}

pub fn flag_spam_behavior(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    wallet: Pubkey,
    timestamp: i64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialAntiSpamInstruction::FlagSpamBehavior { wallet, timestamp },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn apply_cooldown(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    wallet: Pubkey,
    gated_until_epoch: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialAntiSpamInstruction::ApplyCooldown {
            wallet,
            gated_until_epoch,
        },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn clear_cooldown(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    wallet: Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialAntiSpamInstruction::ClearCooldown { wallet },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn apply_spam_penalty(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    wallet: Pubkey,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialAntiSpamInstruction::ApplySpamPenalty { wallet },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn read_anti_spam_profile(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    wallet: Option<Pubkey>,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialAntiSpamInstruction::ReadAntiSpamProfile { wallet },
        vec![AccountMeta::new_readonly(*state_pubkey, false)],
    )
}
