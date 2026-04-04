use {
    crate::state::{
        EngagementProof, ModerationState, SocialPostsStateAccount,
    },
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum SocialPostsInstruction {
    InitializeState {
        state: SocialPostsStateAccount,
    },
    AnchorPost {
        post: crate::state::PostAnchor,
    },
    EditPost {
        post_id: [u8; 32],
        editor: Pubkey,
        content_hash: [u8; 32],
        metadata_hash: [u8; 32],
        content_uri: String,
        edited_at_unix: i64,
    },
    ModeratePost {
        post_id: [u8; 32],
        authority: Pubkey,
        moderation_state: ModerationState,
    },
    RecordEngagement {
        proof: EngagementProof,
    },
    ReadPostsState {
        post_id: Option<[u8; 32]>,
    },
}

pub fn initialize_state(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    payer_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    state: SocialPostsStateAccount,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialPostsInstruction::InitializeState { state },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*payer_pubkey, true),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn anchor_post(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    creator_pubkey: &Pubkey,
    post: crate::state::PostAnchor,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialPostsInstruction::AnchorPost { post },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*creator_pubkey, true),
        ],
    )
}

pub fn edit_post(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    editor_pubkey: &Pubkey,
    post_id: [u8; 32],
    content_hash: [u8; 32],
    metadata_hash: [u8; 32],
    content_uri: String,
    edited_at_unix: i64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialPostsInstruction::EditPost {
            post_id,
            editor: *editor_pubkey,
            content_hash,
            metadata_hash,
            content_uri,
            edited_at_unix,
        },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*editor_pubkey, true),
        ],
    )
}

pub fn moderate_post(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    authority_pubkey: &Pubkey,
    post_id: [u8; 32],
    moderation_state: ModerationState,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialPostsInstruction::ModeratePost {
            post_id,
            authority: *authority_pubkey,
            moderation_state,
        },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*authority_pubkey, true),
        ],
    )
}

pub fn record_engagement(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    actor_pubkey: &Pubkey,
    proof: EngagementProof,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialPostsInstruction::RecordEngagement { proof },
        vec![
            AccountMeta::new(*state_pubkey, false),
            AccountMeta::new_readonly(*actor_pubkey, true),
        ],
    )
}

pub fn read_posts_state(
    program_id: &Pubkey,
    state_pubkey: &Pubkey,
    post_id: Option<[u8; 32]>,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &SocialPostsInstruction::ReadPostsState { post_id },
        vec![AccountMeta::new_readonly(*state_pubkey, false)],
    )
}
