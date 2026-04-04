use {
    crate::error::SocialPostsError,
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum PostKind {
    Original,
    Reply,
    Repost,
    Quote,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum VisibilityClass {
    Public,
    FollowersOnly,
    Permissioned,
    Paid,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum ModerationState {
    Active,
    ReducedReach,
    HiddenByApp,
    LockedByProtocol,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum EngagementActionKind {
    Like,
    Comment,
    Repost,
    Quote,
    Share,
    Save,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SocialPostsConfig {
    pub authority: Pubkey,
    pub posting_enabled: bool,
    pub engagement_enabled: bool,
    pub max_content_uri_len: u16,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct PostAnchor {
    pub post_id: [u8; 32],
    pub creator: Pubkey,
    pub content_hash: [u8; 32],
    pub metadata_hash: [u8; 32],
    pub content_uri: String,
    pub parent_post_id: Option<[u8; 32]>,
    pub post_kind: PostKind,
    pub created_at_unix: i64,
    pub edited_at_unix: Option<i64>,
    pub visibility: VisibilityClass,
    pub moderation_state: ModerationState,
    pub signature_ref: Option<[u8; 32]>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct EngagementProof {
    pub proof_id: [u8; 32],
    pub actor: Pubkey,
    pub target_post_id: Option<[u8; 32]>,
    pub target_creator: Pubkey,
    pub action_kind: EngagementActionKind,
    pub action_weight: u32,
    pub slot: u64,
    pub unix_timestamp: i64,
    pub replay_guard: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SocialPostsStateAccount {
    pub is_initialized: bool,
    pub config: SocialPostsConfig,
    pub posts: Vec<PostAnchor>,
    pub engagement_proofs: Vec<EngagementProof>,
}

impl SocialPostsStateAccount {
    pub fn new(config: SocialPostsConfig) -> Self {
        Self {
            is_initialized: true,
            config,
            posts: Vec::new(),
            engagement_proofs: Vec::new(),
        }
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            Ok(())
        } else {
            Err(SocialPostsError::Uninitialized.into())
        }
    }

    pub fn ensure_authority(&self, authority: &Pubkey) -> Result<(), ProgramError> {
        if *authority == self.config.authority {
            Ok(())
        } else {
            Err(SocialPostsError::Unauthorized.into())
        }
    }

    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let end = data
            .iter()
            .rposition(|byte| *byte != 0)
            .map(|index| index + 1)
            .unwrap_or(0);
        Self::try_from_slice(&data[..end]).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn post_exists(&self, post_id: &[u8; 32]) -> bool {
        self.posts.iter().any(|post| &post.post_id == post_id)
    }

    pub fn proof_exists(&self, proof_id: &[u8; 32]) -> bool {
        self.engagement_proofs
            .iter()
            .any(|proof| &proof.proof_id == proof_id)
    }

    pub fn replay_guard_exists(&self, replay_guard: &[u8; 32]) -> bool {
        self.engagement_proofs
            .iter()
            .any(|proof| &proof.replay_guard == replay_guard)
    }
}
