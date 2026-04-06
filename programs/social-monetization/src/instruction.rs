use {
    crate::state::{
        CreatorTipRecord, PaidContentUnlockRecord, SocialMonetizationStateAccount,
        SubscriptionRecord,
    },
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum SocialMonetizationInstruction {
    InitializeConfig {
        state: SocialMonetizationStateAccount,
    },
    SendCreatorTip {
        record: CreatorTipRecord,
    },
    CreateSubscription {
        record: SubscriptionRecord,
    },
    RenewSubscription {
        subscription_id: [u8; 32],
        valid_until_unix: i64,
    },
    CancelSubscription {
        subscription_id: [u8; 32],
    },
    UnlockPaidContent {
        record: PaidContentUnlockRecord,
    },
    ClaimMonetizationPayout {
        creator: Pubkey,
        amount: u64,
    },
    ReadMonetizationState {
        creator: Option<Pubkey>,
    },
}

pub fn initialize_config(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    payer_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    state: SocialMonetizationStateAccount,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialMonetizationInstruction::InitializeConfig { state },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*payer_pubkey, true),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn send_creator_tip(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    sender_pubkey: &Pubkey,
    record: CreatorTipRecord,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialMonetizationInstruction::SendCreatorTip { record },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*sender_pubkey, true),
        ],
    )
}

pub fn create_subscription(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    subscriber_pubkey: &Pubkey,
    record: SubscriptionRecord,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialMonetizationInstruction::CreateSubscription { record },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*subscriber_pubkey, true),
        ],
    )
}

pub fn renew_subscription(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    subscriber_pubkey: &Pubkey,
    subscription_id: [u8; 32],
    valid_until_unix: i64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialMonetizationInstruction::RenewSubscription {
            subscription_id,
            valid_until_unix,
        },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*subscriber_pubkey, true),
        ],
    )
}

pub fn cancel_subscription(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    subscriber_pubkey: &Pubkey,
    subscription_id: [u8; 32],
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialMonetizationInstruction::CancelSubscription { subscription_id },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*subscriber_pubkey, true),
        ],
    )
}

pub fn unlock_paid_content(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    buyer_pubkey: &Pubkey,
    record: PaidContentUnlockRecord,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialMonetizationInstruction::UnlockPaidContent { record },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*buyer_pubkey, true),
        ],
    )
}

pub fn claim_monetization_payout(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    treasury_pubkey: &Pubkey,
    destination_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    creator: Pubkey,
    amount: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialMonetizationInstruction::ClaimMonetizationPayout { creator, amount },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new(*treasury_pubkey, false),    // source of lamports
            AccountMeta::new(*destination_pubkey, false), // creator's wallet
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn read_monetization_state(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    creator: Option<Pubkey>,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialMonetizationInstruction::ReadMonetizationState { creator },
        vec![AccountMeta::new_readonly(*state_pubkey, false)],
    )
}
