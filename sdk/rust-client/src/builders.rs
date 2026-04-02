use {
    aeko_sdk::{
        hash::Hash,
        instruction::Instruction,
        pubkey::Pubkey,
        signers::Signers,
        transaction::Transaction,
    },
    aeko_token_721_program::{instruction as token_721_instruction, state::NftMetadata},
    aeko_wallet_permissions_program::{
        instruction as wallet_permissions_instruction,
        state::{DelegatePermission, PermissionRole, ProgramPolicyMode, SpendLimitPolicy},
    },
};

#[derive(Clone, Debug)]
pub struct InitializeCollectionInput {
    pub program_id: Pubkey,
    pub collection: Pubkey,
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub base_uri: Option<String>,
}

#[derive(Clone, Debug)]
pub struct MintNftInput {
    pub program_id: Pubkey,
    pub collection: Pubkey,
    pub token: Pubkey,
    pub authority: Pubkey,
    pub token_id: u64,
    pub owner: Pubkey,
    pub creator: Pubkey,
    pub royalty_bps: u16,
    pub metadata: NftMetadata,
}

#[derive(Clone, Debug)]
pub struct TransferNftInput {
    pub program_id: Pubkey,
    pub token: Pubkey,
    pub owner: Pubkey,
    pub new_owner: Pubkey,
}

#[derive(Clone, Debug)]
pub struct UpdateMetadataInput {
    pub program_id: Pubkey,
    pub token: Pubkey,
    pub authority: Pubkey,
    pub metadata: NftMetadata,
}

#[derive(Clone, Debug)]
pub struct ToggleNftFreezeInput {
    pub program_id: Pubkey,
    pub token: Pubkey,
    pub authority: Pubkey,
}

#[derive(Clone, Debug)]
pub struct InitializeWalletPermissionsInput {
    pub program_id: Pubkey,
    pub permission_state: Pubkey,
    pub audit_log: Pubkey,
    pub owner: Pubkey,
    pub wallet: Pubkey,
    pub did: String,
    pub current_epoch: u64,
    pub default_program_policy: ProgramPolicyMode,
}

#[derive(Clone, Debug)]
pub struct GrantDelegateInput {
    pub program_id: Pubkey,
    pub permission_state: Pubkey,
    pub audit_log: Pubkey,
    pub owner: Pubkey,
    pub delegate_permission: DelegatePermission,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct UpdateDelegateInput {
    pub program_id: Pubkey,
    pub permission_state: Pubkey,
    pub audit_log: Pubkey,
    pub owner: Pubkey,
    pub delegate: Pubkey,
    pub role: Option<PermissionRole>,
    pub label: Option<Option<String>>,
    pub valid_until_epoch: Option<Option<u64>>,
    pub spend_limit: Option<SpendLimitPolicy>,
    pub program_allowlist: Option<Vec<Pubkey>>,
    pub token_allowlist: Option<Vec<Pubkey>>,
    pub app_scope_hashes: Option<Vec<[u8; 32]>>,
    pub requires_reauth: Option<bool>,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct RevokeDelegateInput {
    pub program_id: Pubkey,
    pub permission_state: Pubkey,
    pub audit_log: Pubkey,
    pub owner: Pubkey,
    pub delegate: Pubkey,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct FreezeWalletInput {
    pub program_id: Pubkey,
    pub permission_state: Pubkey,
    pub audit_log: Pubkey,
    pub owner: Pubkey,
    pub reason_code: Option<u16>,
    pub reauth_required_until_epoch: Option<u64>,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct UnfreezeWalletInput {
    pub program_id: Pubkey,
    pub permission_state: Pubkey,
    pub audit_log: Pubkey,
    pub owner: Pubkey,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct RecordDelegateUsageInput {
    pub program_id: Pubkey,
    pub permission_state: Pubkey,
    pub audit_log: Pubkey,
    pub owner: Pubkey,
    pub delegate: Pubkey,
    pub target_program: Option<Pubkey>,
    pub mint: Option<Pubkey>,
    pub amount: u64,
    pub day_index: u64,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug)]
pub struct ReadEffectivePermissionsInput {
    pub program_id: Pubkey,
    pub permission_state: Pubkey,
    pub delegate: Pubkey,
    pub current_epoch: u64,
}

pub fn build_initialize_collection_instruction(input: &InitializeCollectionInput) -> Instruction {
    token_721_instruction::initialize_collection(
        &input.program_id,
        &input.collection,
        &input.authority,
        input.name.clone(),
        input.symbol.clone(),
        input.base_uri.clone(),
    )
}

pub fn build_mint_nft_instruction(input: &MintNftInput) -> Instruction {
    token_721_instruction::mint_nft(
        &input.program_id,
        &input.collection,
        &input.token,
        &input.authority,
        input.token_id,
        input.owner,
        input.creator,
        input.royalty_bps,
        input.metadata.clone(),
    )
}

pub fn build_transfer_nft_instruction(input: &TransferNftInput) -> Instruction {
    token_721_instruction::transfer_nft(
        &input.program_id,
        &input.token,
        &input.owner,
        input.new_owner,
    )
}

pub fn build_update_metadata_instruction(input: &UpdateMetadataInput) -> Instruction {
    token_721_instruction::update_metadata(
        &input.program_id,
        &input.token,
        &input.authority,
        input.metadata.clone(),
    )
}

pub fn build_freeze_nft_instruction(input: &ToggleNftFreezeInput) -> Instruction {
    token_721_instruction::freeze_nft(&input.program_id, &input.token, &input.authority)
}

pub fn build_thaw_nft_instruction(input: &ToggleNftFreezeInput) -> Instruction {
    token_721_instruction::thaw_nft(&input.program_id, &input.token, &input.authority)
}

pub fn build_initialize_wallet_permissions_instruction(
    input: &InitializeWalletPermissionsInput,
) -> Instruction {
    wallet_permissions_instruction::initialize_permission_account(
        &input.program_id,
        &input.permission_state,
        &input.audit_log,
        &input.owner,
        input.wallet,
        input.did.clone(),
        input.current_epoch,
        input.default_program_policy,
    )
}

pub fn build_grant_delegate_instruction(input: &GrantDelegateInput) -> Instruction {
    wallet_permissions_instruction::grant_delegate(
        &input.program_id,
        &input.permission_state,
        &input.audit_log,
        &input.owner,
        input.delegate_permission.clone(),
        input.current_epoch,
        input.current_slot,
    )
}

pub fn build_update_delegate_instruction(input: &UpdateDelegateInput) -> Instruction {
    wallet_permissions_instruction::update_delegate(
        &input.program_id,
        &input.permission_state,
        &input.audit_log,
        &input.owner,
        input.delegate,
        input.role,
        input.label.clone(),
        input.valid_until_epoch,
        input.spend_limit.clone(),
        input.program_allowlist.clone(),
        input.token_allowlist.clone(),
        input.app_scope_hashes.clone(),
        input.requires_reauth,
        input.current_epoch,
        input.current_slot,
    )
}

pub fn build_revoke_delegate_instruction(input: &RevokeDelegateInput) -> Instruction {
    wallet_permissions_instruction::revoke_delegate(
        &input.program_id,
        &input.permission_state,
        &input.audit_log,
        &input.owner,
        input.delegate,
        input.current_epoch,
        input.current_slot,
    )
}

pub fn build_freeze_wallet_instruction(input: &FreezeWalletInput) -> Instruction {
    wallet_permissions_instruction::freeze_wallet(
        &input.program_id,
        &input.permission_state,
        &input.audit_log,
        &input.owner,
        input.reason_code,
        input.reauth_required_until_epoch,
        input.current_epoch,
        input.current_slot,
    )
}

pub fn build_unfreeze_wallet_instruction(input: &UnfreezeWalletInput) -> Instruction {
    wallet_permissions_instruction::unfreeze_wallet(
        &input.program_id,
        &input.permission_state,
        &input.audit_log,
        &input.owner,
        input.current_epoch,
        input.current_slot,
    )
}

pub fn build_record_delegate_usage_instruction(input: &RecordDelegateUsageInput) -> Instruction {
    wallet_permissions_instruction::record_delegate_usage(
        &input.program_id,
        &input.permission_state,
        &input.audit_log,
        &input.owner,
        input.delegate,
        input.target_program,
        input.mint,
        input.amount,
        input.day_index,
        input.current_epoch,
        input.current_slot,
    )
}

pub fn build_read_effective_permissions_instruction(
    input: &ReadEffectivePermissionsInput,
) -> Instruction {
    wallet_permissions_instruction::read_effective_permissions(
        &input.program_id,
        &input.permission_state,
        input.delegate,
        input.current_epoch,
    )
}

pub fn build_unsigned_transaction(
    instructions: Vec<Instruction>,
    payer: Option<&Pubkey>,
    recent_blockhash: Hash,
) -> Transaction {
    let mut transaction = Transaction::new_with_payer(&instructions, payer);
    transaction.message.recent_blockhash = recent_blockhash;
    transaction
}

pub fn build_signed_transaction<T: Signers + ?Sized>(
    instructions: Vec<Instruction>,
    payer: Option<&Pubkey>,
    signers: &T,
    recent_blockhash: Hash,
) -> Transaction {
    Transaction::new_signed_with_payer(&instructions, payer, signers, recent_blockhash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use aeko_sdk::signature::{Keypair, Signer};

    #[test]
    fn builds_initialize_collection_instruction() {
        let authority = Keypair::new();
        let collection = Pubkey::new_unique();
        let instruction = build_initialize_collection_instruction(&InitializeCollectionInput {
            program_id: aeko_token_721_program::id(),
            collection,
            authority: authority.pubkey(),
            name: "AEKO Demo".to_string(),
            symbol: "ADMO".to_string(),
            base_uri: Some("https://example.aeko".to_string()),
        });

        assert_eq!(instruction.program_id, aeko_token_721_program::id());
        assert_eq!(instruction.accounts.len(), 2);
        assert_eq!(instruction.accounts[0].pubkey, collection);
    }

    #[test]
    fn builds_signed_wallet_permission_transaction() {
        let owner = Keypair::new();
        let instruction = build_unfreeze_wallet_instruction(&UnfreezeWalletInput {
            program_id: aeko_wallet_permissions_program::id(),
            permission_state: Pubkey::new_unique(),
            audit_log: Pubkey::new_unique(),
            owner: owner.pubkey(),
            current_epoch: 11,
            current_slot: 99,
        });

        let blockhash = Hash::new_unique();
        let transaction =
            build_signed_transaction(vec![instruction], Some(&owner.pubkey()), &[&owner], blockhash);

        assert_eq!(transaction.message.account_keys[0], owner.pubkey());
        assert_eq!(transaction.message.recent_blockhash, blockhash);
        assert_eq!(transaction.signatures.len(), 1);
    }
}
