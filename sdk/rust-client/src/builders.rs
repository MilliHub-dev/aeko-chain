use borsh::{to_vec, BorshDeserialize, BorshSerialize};

pub type PubkeyString = String;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AccountMetaPlan {
    pub pubkey: PubkeyString,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstructionPlan {
    pub program_id: PubkeyString,
    pub accounts: Vec<AccountMetaPlan>,
    pub data: Vec<u8>,
}

impl InstructionPlan {
    pub fn data_base64(&self) -> String {
        use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
        BASE64.encode(&self.data)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TransactionPlan {
    pub payer: PubkeyString,
    pub recent_blockhash: String,
    pub instructions: Vec<InstructionPlan>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct MetadataAttribute {
    pub trait_type: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct NftMetadata {
    pub name: String,
    pub description: Option<String>,
    pub uri: String,
    pub image_uri: Option<String>,
    pub attributes: Vec<MetadataAttribute>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct Aeko721Collection {
    pub authority: PubkeyString,
    pub name: String,
    pub symbol: String,
    pub base_uri: Option<String>,
    pub total_minted: u64,
    pub is_initialized: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct Aeko721Token {
    pub collection: PubkeyString,
    pub token_id: u64,
    pub owner: PubkeyString,
    pub creator: PubkeyString,
    pub royalty_bps: u16,
    pub metadata: NftMetadata,
    pub frozen: bool,
    pub is_initialized: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum PermissionRole {
    Owner,
    Spender,
    Viewer,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum PermissionStatus {
    Active,
    Revoked,
    Expired,
    Frozen,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum ProgramPolicyMode {
    DenyByDefault,
    AllowByDefault,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct TokenSpendCap {
    pub mint: PubkeyString,
    pub max_single_tx: Option<u64>,
    pub max_daily: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SpendLimitPolicy {
    pub max_single_tx_aeko: Option<u64>,
    pub max_daily_aeko: Option<u64>,
    pub token_caps: Vec<TokenSpendCap>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct DelegatePermission {
    pub delegate: PubkeyString,
    pub role: PermissionRole,
    pub label: Option<String>,
    pub status: PermissionStatus,
    pub valid_from_epoch: u64,
    pub valid_until_epoch: Option<u64>,
    pub spend_limit: SpendLimitPolicy,
    pub program_allowlist: Vec<PubkeyString>,
    pub token_allowlist: Vec<PubkeyString>,
    pub app_scope_hashes: Vec<[u8; 32]>,
    pub requires_reauth: bool,
    pub last_used_epoch: Option<u64>,
    pub last_used_slot: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct TokenSpendCounter {
    pub mint: PubkeyString,
    pub amount: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct DelegateUsageWindow {
    pub delegate: PubkeyString,
    pub day_index: u64,
    pub aeko_spent_today: u64,
    pub token_spent_today: Vec<TokenSpendCounter>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct AuditEventSummary {
    pub role: Option<PermissionRole>,
    pub status: Option<PermissionStatus>,
    pub affected_programs: Vec<PubkeyString>,
    pub affected_mints: Vec<PubkeyString>,
    pub valid_until_epoch: Option<u64>,
    pub amount_hint: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct WalletPermissionAuditLogEntry {
    pub wallet: PubkeyString,
    pub sequence: u64,
    pub actor: PubkeyString,
    pub target_delegate: Option<PubkeyString>,
    pub event_type: u8,
    pub event_summary: AuditEventSummary,
    pub created_at_epoch: u64,
    pub created_at_slot: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct WalletPermissionAuditLogAccount {
    pub wallet: PubkeyString,
    pub next_sequence: u64,
    pub entries: Vec<WalletPermissionAuditLogEntry>,
    pub is_initialized: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct WalletPermissionAccount {
    pub wallet: PubkeyString,
    pub did: String,
    pub version: u8,
    pub policy_nonce: u64,
    pub is_frozen: bool,
    pub freeze_reason_code: Option<u16>,
    pub reauth_required_until_epoch: Option<u64>,
    pub owner: PubkeyString,
    pub delegates: Vec<DelegatePermission>,
    pub usage_windows: Vec<DelegateUsageWindow>,
    pub default_program_policy: ProgramPolicyMode,
    pub created_at_epoch: u64,
    pub updated_at_epoch: u64,
    pub is_initialized: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
enum Token721Instruction {
    InitializeCollection {
        name: String,
        symbol: String,
        base_uri: Option<String>,
    },
    MintNft {
        token_id: u64,
        owner: PubkeyString,
        creator: PubkeyString,
        royalty_bps: u16,
        metadata: NftMetadata,
    },
    FreezeNft,
    ThawNft,
    TransferNft {
        new_owner: PubkeyString,
    },
    UpdateMetadata {
        metadata: NftMetadata,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
enum WalletPermissionsInstruction {
    InitializePermissionAccount {
        wallet: PubkeyString,
        did: String,
        current_epoch: u64,
        default_program_policy: ProgramPolicyMode,
    },
    GrantDelegate {
        delegate_permission: DelegatePermission,
        current_epoch: u64,
        current_slot: u64,
    },
    UpdateDelegate {
        delegate: PubkeyString,
        role: Option<PermissionRole>,
        label: Option<Option<String>>,
        valid_until_epoch: Option<Option<u64>>,
        spend_limit: Option<SpendLimitPolicy>,
        program_allowlist: Option<Vec<PubkeyString>>,
        token_allowlist: Option<Vec<PubkeyString>>,
        app_scope_hashes: Option<Vec<[u8; 32]>>,
        requires_reauth: Option<bool>,
        current_epoch: u64,
        current_slot: u64,
    },
    RevokeDelegate {
        delegate: PubkeyString,
        current_epoch: u64,
        current_slot: u64,
    },
    FreezeWallet {
        reason_code: Option<u16>,
        reauth_required_until_epoch: Option<u64>,
        current_epoch: u64,
        current_slot: u64,
    },
    UnfreezeWallet {
        current_epoch: u64,
        current_slot: u64,
    },
    RecordDelegateUsage {
        delegate: PubkeyString,
        target_program: Option<PubkeyString>,
        mint: Option<PubkeyString>,
        amount: u64,
        day_index: u64,
        current_epoch: u64,
        current_slot: u64,
    },
    ReadEffectivePermissions {
        delegate: PubkeyString,
        current_epoch: u64,
    },
}

#[derive(Clone, Debug)]
pub struct InitializeCollectionInput {
    pub program_id: PubkeyString,
    pub collection: PubkeyString,
    pub authority: PubkeyString,
    pub name: String,
    pub symbol: String,
    pub base_uri: Option<String>,
}

#[derive(Clone, Debug)]
pub struct MintNftInput {
    pub program_id: PubkeyString,
    pub collection: PubkeyString,
    pub token: PubkeyString,
    pub authority: PubkeyString,
    pub token_id: u64,
    pub owner: PubkeyString,
    pub creator: PubkeyString,
    pub royalty_bps: u16,
    pub metadata: NftMetadata,
}

#[derive(Clone, Debug)]
pub struct TransferNftInput {
    pub program_id: PubkeyString,
    pub token: PubkeyString,
    pub owner: PubkeyString,
    pub new_owner: PubkeyString,
}

#[derive(Clone, Debug)]
pub struct UpdateMetadataInput {
    pub program_id: PubkeyString,
    pub token: PubkeyString,
    pub authority: PubkeyString,
    pub metadata: NftMetadata,
}

#[derive(Clone, Debug)]
pub struct ToggleNftFreezeInput {
    pub program_id: PubkeyString,
    pub token: PubkeyString,
    pub authority: PubkeyString,
}

#[derive(Clone, Debug)]
pub struct InitializeWalletPermissionsInput {
    pub program_id: PubkeyString,
    pub permission_state: PubkeyString,
    pub audit_log: PubkeyString,
    pub owner: PubkeyString,
    pub wallet: PubkeyString,
    pub did: String,
    pub current_epoch: u64,
    pub default_program_policy: ProgramPolicyMode,
}

#[derive(Clone, Debug)]
pub struct GrantDelegateInput {
    pub program_id: PubkeyString,
    pub permission_state: PubkeyString,
    pub audit_log: PubkeyString,
    pub owner: PubkeyString,
    pub delegate_permission: DelegatePermission,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct UpdateDelegateInput {
    pub program_id: PubkeyString,
    pub permission_state: PubkeyString,
    pub audit_log: PubkeyString,
    pub owner: PubkeyString,
    pub delegate: PubkeyString,
    pub role: Option<PermissionRole>,
    pub label: Option<Option<String>>,
    pub valid_until_epoch: Option<Option<u64>>,
    pub spend_limit: Option<SpendLimitPolicy>,
    pub program_allowlist: Option<Vec<PubkeyString>>,
    pub token_allowlist: Option<Vec<PubkeyString>>,
    pub app_scope_hashes: Option<Vec<[u8; 32]>>,
    pub requires_reauth: Option<bool>,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct RevokeDelegateInput {
    pub program_id: PubkeyString,
    pub permission_state: PubkeyString,
    pub audit_log: PubkeyString,
    pub owner: PubkeyString,
    pub delegate: PubkeyString,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct FreezeWalletInput {
    pub program_id: PubkeyString,
    pub permission_state: PubkeyString,
    pub audit_log: PubkeyString,
    pub owner: PubkeyString,
    pub reason_code: Option<u16>,
    pub reauth_required_until_epoch: Option<u64>,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct UnfreezeWalletInput {
    pub program_id: PubkeyString,
    pub permission_state: PubkeyString,
    pub audit_log: PubkeyString,
    pub owner: PubkeyString,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct RecordDelegateUsageInput {
    pub program_id: PubkeyString,
    pub permission_state: PubkeyString,
    pub audit_log: PubkeyString,
    pub owner: PubkeyString,
    pub delegate: PubkeyString,
    pub target_program: Option<PubkeyString>,
    pub mint: Option<PubkeyString>,
    pub amount: u64,
    pub day_index: u64,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct ReadEffectivePermissionsInput {
    pub program_id: PubkeyString,
    pub permission_state: PubkeyString,
    pub delegate: PubkeyString,
    pub current_epoch: u64,
}

pub fn default_token_721_program_id() -> PubkeyString {
    bs58::encode([10u8; 32]).into_string()
}

pub fn default_wallet_permissions_program_id() -> PubkeyString {
    bs58::encode([10u8; 32]).into_string()
}

pub fn build_initialize_collection_instruction(input: &InitializeCollectionInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![
            writable(&input.collection),
            readonly_signer(&input.authority),
        ],
        Token721Instruction::InitializeCollection {
            name: input.name.clone(),
            symbol: input.symbol.clone(),
            base_uri: input.base_uri.clone(),
        },
    )
}

pub fn build_mint_nft_instruction(input: &MintNftInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![
            writable(&input.collection),
            writable(&input.token),
            readonly_signer(&input.authority),
        ],
        Token721Instruction::MintNft {
            token_id: input.token_id,
            owner: input.owner.clone(),
            creator: input.creator.clone(),
            royalty_bps: input.royalty_bps,
            metadata: input.metadata.clone(),
        },
    )
}

pub fn build_transfer_nft_instruction(input: &TransferNftInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![writable(&input.token), readonly_signer(&input.owner)],
        Token721Instruction::TransferNft {
            new_owner: input.new_owner.clone(),
        },
    )
}

pub fn build_update_metadata_instruction(input: &UpdateMetadataInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![writable(&input.token), readonly_signer(&input.authority)],
        Token721Instruction::UpdateMetadata {
            metadata: input.metadata.clone(),
        },
    )
}

pub fn build_freeze_nft_instruction(input: &ToggleNftFreezeInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![writable(&input.token), readonly_signer(&input.authority)],
        Token721Instruction::FreezeNft,
    )
}

pub fn build_thaw_nft_instruction(input: &ToggleNftFreezeInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![writable(&input.token), readonly_signer(&input.authority)],
        Token721Instruction::ThawNft,
    )
}

pub fn build_initialize_wallet_permissions_instruction(
    input: &InitializeWalletPermissionsInput,
) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![
            writable(&input.permission_state),
            writable(&input.audit_log),
            readonly_signer(&input.owner),
        ],
        WalletPermissionsInstruction::InitializePermissionAccount {
            wallet: input.wallet.clone(),
            did: input.did.clone(),
            current_epoch: input.current_epoch,
            default_program_policy: input.default_program_policy,
        },
    )
}

pub fn build_grant_delegate_instruction(input: &GrantDelegateInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![
            writable(&input.permission_state),
            writable(&input.audit_log),
            readonly_signer(&input.owner),
        ],
        WalletPermissionsInstruction::GrantDelegate {
            delegate_permission: input.delegate_permission.clone(),
            current_epoch: input.current_epoch,
            current_slot: input.current_slot,
        },
    )
}

pub fn build_update_delegate_instruction(input: &UpdateDelegateInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![
            writable(&input.permission_state),
            writable(&input.audit_log),
            readonly_signer(&input.owner),
        ],
        WalletPermissionsInstruction::UpdateDelegate {
            delegate: input.delegate.clone(),
            role: input.role,
            label: input.label.clone(),
            valid_until_epoch: input.valid_until_epoch,
            spend_limit: input.spend_limit.clone(),
            program_allowlist: input.program_allowlist.clone(),
            token_allowlist: input.token_allowlist.clone(),
            app_scope_hashes: input.app_scope_hashes.clone(),
            requires_reauth: input.requires_reauth,
            current_epoch: input.current_epoch,
            current_slot: input.current_slot,
        },
    )
}

pub fn build_revoke_delegate_instruction(input: &RevokeDelegateInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![
            writable(&input.permission_state),
            writable(&input.audit_log),
            readonly_signer(&input.owner),
        ],
        WalletPermissionsInstruction::RevokeDelegate {
            delegate: input.delegate.clone(),
            current_epoch: input.current_epoch,
            current_slot: input.current_slot,
        },
    )
}

pub fn build_freeze_wallet_instruction(input: &FreezeWalletInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![
            writable(&input.permission_state),
            writable(&input.audit_log),
            readonly_signer(&input.owner),
        ],
        WalletPermissionsInstruction::FreezeWallet {
            reason_code: input.reason_code,
            reauth_required_until_epoch: input.reauth_required_until_epoch,
            current_epoch: input.current_epoch,
            current_slot: input.current_slot,
        },
    )
}

pub fn build_unfreeze_wallet_instruction(input: &UnfreezeWalletInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![
            writable(&input.permission_state),
            writable(&input.audit_log),
            readonly_signer(&input.owner),
        ],
        WalletPermissionsInstruction::UnfreezeWallet {
            current_epoch: input.current_epoch,
            current_slot: input.current_slot,
        },
    )
}

pub fn build_record_delegate_usage_instruction(input: &RecordDelegateUsageInput) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![
            writable(&input.permission_state),
            writable(&input.audit_log),
            readonly_signer(&input.owner),
        ],
        WalletPermissionsInstruction::RecordDelegateUsage {
            delegate: input.delegate.clone(),
            target_program: input.target_program.clone(),
            mint: input.mint.clone(),
            amount: input.amount,
            day_index: input.day_index,
            current_epoch: input.current_epoch,
            current_slot: input.current_slot,
        },
    )
}

pub fn build_read_effective_permissions_instruction(
    input: &ReadEffectivePermissionsInput,
) -> InstructionPlan {
    instruction_plan(
        input.program_id.clone(),
        vec![readonly(&input.permission_state)],
        WalletPermissionsInstruction::ReadEffectivePermissions {
            delegate: input.delegate.clone(),
            current_epoch: input.current_epoch,
        },
    )
}

pub fn build_transaction_plan(
    instructions: Vec<InstructionPlan>,
    payer: impl Into<String>,
    recent_blockhash: impl Into<String>,
) -> TransactionPlan {
    TransactionPlan {
        payer: payer.into(),
        recent_blockhash: recent_blockhash.into(),
        instructions,
    }
}

fn instruction_plan<T: BorshSerialize>(
    program_id: String,
    accounts: Vec<AccountMetaPlan>,
    payload: T,
) -> InstructionPlan {
    InstructionPlan {
        program_id,
        accounts,
        data: to_vec(&payload).expect("borsh serialization should succeed"),
    }
}

fn readonly(pubkey: &str) -> AccountMetaPlan {
    AccountMetaPlan {
        pubkey: pubkey.to_string(),
        is_signer: false,
        is_writable: false,
    }
}

fn writable(pubkey: &str) -> AccountMetaPlan {
    AccountMetaPlan {
        pubkey: pubkey.to_string(),
        is_signer: false,
        is_writable: true,
    }
}

fn readonly_signer(pubkey: &str) -> AccountMetaPlan {
    AccountMetaPlan {
        pubkey: pubkey.to_string(),
        is_signer: true,
        is_writable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_pubkey(seed: u8) -> String {
        bs58::encode([seed; 32]).into_string()
    }

    #[test]
    fn builds_initialize_collection_instruction() {
        let instruction = build_initialize_collection_instruction(&InitializeCollectionInput {
            program_id: default_token_721_program_id(),
            collection: fake_pubkey(1),
            authority: fake_pubkey(2),
            name: "AEKO Demo".to_string(),
            symbol: "ADMO".to_string(),
            base_uri: Some("https://example.aeko".to_string()),
        });

        assert_eq!(instruction.accounts.len(), 2);
        assert_eq!(instruction.accounts[0].is_writable, true);
        assert!(!instruction.data.is_empty());
    }

    #[test]
    fn builds_wallet_permission_transaction_plan() {
        let instruction = build_unfreeze_wallet_instruction(&UnfreezeWalletInput {
            program_id: default_wallet_permissions_program_id(),
            permission_state: fake_pubkey(3),
            audit_log: fake_pubkey(4),
            owner: fake_pubkey(5),
            current_epoch: 11,
            current_slot: 99,
        });

        let plan = build_transaction_plan(vec![instruction], fake_pubkey(5), "blockhash");
        assert_eq!(plan.instructions.len(), 1);
        assert_eq!(plan.payer, fake_pubkey(5));
    }
}
