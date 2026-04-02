use {
    crate::{sign_transaction, EncryptedKeystore, LedgerWalletAccount, WalletCoreError},
    aeko_sdk::{
        hash::Hash,
        instruction::Instruction,
        message::Message,
        pubkey::Pubkey,
        transaction::Transaction,
    },
    aeko_wallet_permissions_program::{
        id as wallet_permissions_program_id,
        instruction as wallet_permissions_instruction,
        state::{DelegatePermission, PermissionRole, ProgramPolicyMode, SpendLimitPolicy},
    },
};

pub use aeko_wallet_permissions_program::state::{
    DelegateUsageWindow, EffectivePermissionView, PermissionStatus, TokenSpendCap,
    WalletPermissionAccount, WalletPermissionAuditLogAccount,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WalletPermissionAccounts {
    pub permission_state: Pubkey,
    pub audit_log: Pubkey,
    pub owner: Pubkey,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PermissionTransactionPlan {
    pub instruction: Instruction,
    pub message: Message,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InitializePermissionsInput {
    pub accounts: WalletPermissionAccounts,
    pub wallet: Pubkey,
    pub did: String,
    pub current_epoch: u64,
    pub default_program_policy: ProgramPolicyMode,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GrantDelegateInput {
    pub accounts: WalletPermissionAccounts,
    pub delegate_permission: DelegatePermission,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpdateDelegateInput {
    pub accounts: WalletPermissionAccounts,
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

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RevokeDelegateInput {
    pub accounts: WalletPermissionAccounts,
    pub delegate: Pubkey,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FreezeWalletInput {
    pub accounts: WalletPermissionAccounts,
    pub reason_code: Option<u16>,
    pub reauth_required_until_epoch: Option<u64>,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UnfreezeWalletInput {
    pub accounts: WalletPermissionAccounts,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecordDelegateUsageInput {
    pub accounts: WalletPermissionAccounts,
    pub delegate: Pubkey,
    pub target_program: Option<Pubkey>,
    pub mint: Option<Pubkey>,
    pub amount: u64,
    pub day_index: u64,
    pub current_epoch: u64,
    pub current_slot: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReadEffectivePermissionsInput {
    pub permission_state: Pubkey,
    pub delegate: Pubkey,
    pub current_epoch: u64,
}

pub fn default_wallet_permissions_program_id() -> Pubkey {
    wallet_permissions_program_id()
}

pub fn build_initialize_permissions_plan(input: InitializePermissionsInput) -> PermissionTransactionPlan {
    let instruction = wallet_permissions_instruction::initialize_permission_account(
        &default_wallet_permissions_program_id(),
        &input.accounts.permission_state,
        &input.accounts.audit_log,
        &input.accounts.owner,
        input.wallet,
        input.did,
        input.current_epoch,
        input.default_program_policy,
    );
    build_plan(input.accounts.owner, instruction)
}

pub fn build_grant_delegate_plan(input: GrantDelegateInput) -> PermissionTransactionPlan {
    let instruction = wallet_permissions_instruction::grant_delegate(
        &default_wallet_permissions_program_id(),
        &input.accounts.permission_state,
        &input.accounts.audit_log,
        &input.accounts.owner,
        input.delegate_permission,
        input.current_epoch,
        input.current_slot,
    );
    build_plan(input.accounts.owner, instruction)
}

#[allow(clippy::too_many_arguments)]
pub fn build_update_delegate_plan(input: UpdateDelegateInput) -> PermissionTransactionPlan {
    let instruction = wallet_permissions_instruction::update_delegate(
        &default_wallet_permissions_program_id(),
        &input.accounts.permission_state,
        &input.accounts.audit_log,
        &input.accounts.owner,
        input.delegate,
        input.role,
        input.label,
        input.valid_until_epoch,
        input.spend_limit,
        input.program_allowlist,
        input.token_allowlist,
        input.app_scope_hashes,
        input.requires_reauth,
        input.current_epoch,
        input.current_slot,
    );
    build_plan(input.accounts.owner, instruction)
}

pub fn build_revoke_delegate_plan(input: RevokeDelegateInput) -> PermissionTransactionPlan {
    let instruction = wallet_permissions_instruction::revoke_delegate(
        &default_wallet_permissions_program_id(),
        &input.accounts.permission_state,
        &input.accounts.audit_log,
        &input.accounts.owner,
        input.delegate,
        input.current_epoch,
        input.current_slot,
    );
    build_plan(input.accounts.owner, instruction)
}

pub fn build_freeze_wallet_plan(input: FreezeWalletInput) -> PermissionTransactionPlan {
    let instruction = wallet_permissions_instruction::freeze_wallet(
        &default_wallet_permissions_program_id(),
        &input.accounts.permission_state,
        &input.accounts.audit_log,
        &input.accounts.owner,
        input.reason_code,
        input.reauth_required_until_epoch,
        input.current_epoch,
        input.current_slot,
    );
    build_plan(input.accounts.owner, instruction)
}

pub fn build_unfreeze_wallet_plan(input: UnfreezeWalletInput) -> PermissionTransactionPlan {
    let instruction = wallet_permissions_instruction::unfreeze_wallet(
        &default_wallet_permissions_program_id(),
        &input.accounts.permission_state,
        &input.accounts.audit_log,
        &input.accounts.owner,
        input.current_epoch,
        input.current_slot,
    );
    build_plan(input.accounts.owner, instruction)
}

pub fn build_record_delegate_usage_plan(input: RecordDelegateUsageInput) -> PermissionTransactionPlan {
    let instruction = wallet_permissions_instruction::record_delegate_usage(
        &default_wallet_permissions_program_id(),
        &input.accounts.permission_state,
        &input.accounts.audit_log,
        &input.accounts.owner,
        input.delegate,
        input.target_program,
        input.mint,
        input.amount,
        input.day_index,
        input.current_epoch,
        input.current_slot,
    );
    build_plan(input.accounts.owner, instruction)
}

pub fn build_read_effective_permissions_instruction(
    input: ReadEffectivePermissionsInput,
) -> Instruction {
    wallet_permissions_instruction::read_effective_permissions(
        &default_wallet_permissions_program_id(),
        &input.permission_state,
        input.delegate,
        input.current_epoch,
    )
}

pub fn sign_permission_plan_with_keystore(
    keystore: &EncryptedKeystore,
    password: &str,
    plan: &PermissionTransactionPlan,
    recent_blockhash: Hash,
) -> Result<Transaction, WalletCoreError> {
    sign_transaction(keystore, password, plan.message.clone(), recent_blockhash)
}

pub fn sign_permission_plan_with_ledger(
    ledger: &LedgerWalletAccount,
    plan: &PermissionTransactionPlan,
    recent_blockhash: Hash,
) -> Result<Transaction, WalletCoreError> {
    ledger.sign_transaction(plan.message.clone(), recent_blockhash)
}

fn build_plan(payer: Pubkey, instruction: Instruction) -> PermissionTransactionPlan {
    let message = Message::new(&[instruction.clone()], Some(&payer));
    PermissionTransactionPlan { instruction, message }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn accounts() -> WalletPermissionAccounts {
        WalletPermissionAccounts {
            permission_state: Pubkey::new_unique(),
            audit_log: Pubkey::new_unique(),
            owner: Pubkey::new_unique(),
        }
    }

    fn sample_delegate(delegate: Pubkey) -> DelegatePermission {
        DelegatePermission {
            delegate,
            role: PermissionRole::Spender,
            label: Some("session".to_string()),
            status: aeko_wallet_permissions_program::state::PermissionStatus::Active,
            valid_from_epoch: 1,
            valid_until_epoch: Some(10),
            spend_limit: SpendLimitPolicy {
                max_single_tx_aeko: Some(100),
                max_daily_aeko: Some(500),
                token_caps: Vec::new(),
            },
            program_allowlist: vec![Pubkey::new_unique()],
            token_allowlist: Vec::new(),
            app_scope_hashes: Vec::new(),
            requires_reauth: false,
            last_used_epoch: None,
            last_used_slot: None,
        }
    }

    #[test]
    fn build_grant_delegate_plan_uses_owner_as_payer() {
        let accounts = accounts();
        let delegate = sample_delegate(Pubkey::new_unique());
        let plan = build_grant_delegate_plan(GrantDelegateInput {
            accounts: accounts.clone(),
            delegate_permission: delegate,
            current_epoch: 2,
            current_slot: 20,
        });

        assert_eq!(plan.message.account_keys[0], accounts.owner);
        assert_eq!(plan.instruction.program_id, default_wallet_permissions_program_id());
        assert_eq!(plan.instruction.accounts.len(), 3);
    }

    #[test]
    fn build_read_effective_permissions_instruction_targets_program() {
        let permission_state = Pubkey::new_unique();
        let delegate = Pubkey::new_unique();
        let instruction = build_read_effective_permissions_instruction(ReadEffectivePermissionsInput {
            permission_state,
            delegate,
            current_epoch: 9,
        });

        assert_eq!(instruction.program_id, default_wallet_permissions_program_id());
        assert_eq!(instruction.accounts.len(), 1);
        assert_eq!(instruction.accounts[0].pubkey, permission_state);
    }
}
