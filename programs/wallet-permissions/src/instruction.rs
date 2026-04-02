use {
    crate::state::{DelegatePermission, ProgramPolicyMode, SpendLimitPolicy, WalletPermissionAccount},
    borsh::{BorshDeserialize, BorshSerialize},
    aeko_sdk::{
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
    },
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum WalletPermissionsInstruction {
    InitializePermissionAccount {
        wallet: Pubkey,
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
        delegate: Pubkey,
        role: Option<crate::state::PermissionRole>,
        label: Option<Option<String>>,
        valid_until_epoch: Option<Option<u64>>,
        spend_limit: Option<SpendLimitPolicy>,
        program_allowlist: Option<Vec<Pubkey>>,
        token_allowlist: Option<Vec<Pubkey>>,
        app_scope_hashes: Option<Vec<[u8; 32]>>,
        requires_reauth: Option<bool>,
        current_epoch: u64,
        current_slot: u64,
    },
    RevokeDelegate {
        delegate: Pubkey,
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
        delegate: Pubkey,
        target_program: Option<Pubkey>,
        mint: Option<Pubkey>,
        amount: u64,
        day_index: u64,
        current_epoch: u64,
        current_slot: u64,
    },
    ReadEffectivePermissions {
        delegate: Pubkey,
        current_epoch: u64,
    },
}

#[allow(clippy::too_many_arguments)]
pub fn update_delegate(
    program_id: &Pubkey,
    permission_state_pubkey: &Pubkey,
    audit_log_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    delegate: Pubkey,
    role: Option<crate::state::PermissionRole>,
    label: Option<Option<String>>,
    valid_until_epoch: Option<Option<u64>>,
    spend_limit: Option<SpendLimitPolicy>,
    program_allowlist: Option<Vec<Pubkey>>,
    token_allowlist: Option<Vec<Pubkey>>,
    app_scope_hashes: Option<Vec<[u8; 32]>>,
    requires_reauth: Option<bool>,
    current_epoch: u64,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &WalletPermissionsInstruction::UpdateDelegate {
            delegate,
            role,
            label,
            valid_until_epoch,
            spend_limit,
            program_allowlist,
            token_allowlist,
            app_scope_hashes,
            requires_reauth,
            current_epoch,
            current_slot,
        },
        vec![
            AccountMeta::new(*permission_state_pubkey, false),
            AccountMeta::new(*audit_log_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn initialize_permission_account(
    program_id: &Pubkey,
    permission_state_pubkey: &Pubkey,
    audit_log_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    wallet: Pubkey,
    did: String,
    current_epoch: u64,
    default_program_policy: ProgramPolicyMode,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &WalletPermissionsInstruction::InitializePermissionAccount {
            wallet,
            did,
            current_epoch,
            default_program_policy,
        },
        vec![
            AccountMeta::new(*permission_state_pubkey, false),
            AccountMeta::new(*audit_log_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn grant_delegate(
    program_id: &Pubkey,
    permission_state_pubkey: &Pubkey,
    audit_log_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    delegate_permission: DelegatePermission,
    current_epoch: u64,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &WalletPermissionsInstruction::GrantDelegate {
            delegate_permission,
            current_epoch,
            current_slot,
        },
        vec![
            AccountMeta::new(*permission_state_pubkey, false),
            AccountMeta::new(*audit_log_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn revoke_delegate(
    program_id: &Pubkey,
    permission_state_pubkey: &Pubkey,
    audit_log_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    delegate: Pubkey,
    current_epoch: u64,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &WalletPermissionsInstruction::RevokeDelegate {
            delegate,
            current_epoch,
            current_slot,
        },
        vec![
            AccountMeta::new(*permission_state_pubkey, false),
            AccountMeta::new(*audit_log_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn freeze_wallet(
    program_id: &Pubkey,
    permission_state_pubkey: &Pubkey,
    audit_log_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    reason_code: Option<u16>,
    reauth_required_until_epoch: Option<u64>,
    current_epoch: u64,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &WalletPermissionsInstruction::FreezeWallet {
            reason_code,
            reauth_required_until_epoch,
            current_epoch,
            current_slot,
        },
        vec![
            AccountMeta::new(*permission_state_pubkey, false),
            AccountMeta::new(*audit_log_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn unfreeze_wallet(
    program_id: &Pubkey,
    permission_state_pubkey: &Pubkey,
    audit_log_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    current_epoch: u64,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &WalletPermissionsInstruction::UnfreezeWallet {
            current_epoch,
            current_slot,
        },
        vec![
            AccountMeta::new(*permission_state_pubkey, false),
            AccountMeta::new(*audit_log_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

#[allow(clippy::too_many_arguments)]
pub fn record_delegate_usage(
    program_id: &Pubkey,
    permission_state_pubkey: &Pubkey,
    audit_log_pubkey: &Pubkey,
    owner_pubkey: &Pubkey,
    delegate: Pubkey,
    target_program: Option<Pubkey>,
    mint: Option<Pubkey>,
    amount: u64,
    day_index: u64,
    current_epoch: u64,
    current_slot: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &WalletPermissionsInstruction::RecordDelegateUsage {
            delegate,
            target_program,
            mint,
            amount,
            day_index,
            current_epoch,
            current_slot,
        },
        vec![
            AccountMeta::new(*permission_state_pubkey, false),
            AccountMeta::new(*audit_log_pubkey, false),
            AccountMeta::new_readonly(*owner_pubkey, true),
        ],
    )
}

pub fn read_effective_permissions(
    program_id: &Pubkey,
    permission_state_pubkey: &Pubkey,
    delegate: Pubkey,
    current_epoch: u64,
) -> Instruction {
    Instruction::new_with_borsh(
        *program_id,
        &WalletPermissionsInstruction::ReadEffectivePermissions {
            delegate,
            current_epoch,
        },
        vec![AccountMeta::new_readonly(*permission_state_pubkey, false)],
    )
}

pub fn initialized_state(
    wallet: Pubkey,
    did: String,
    owner: Pubkey,
    default_program_policy: ProgramPolicyMode,
    current_epoch: u64,
) -> WalletPermissionAccount {
    WalletPermissionAccount::new(wallet, did, owner, default_program_policy, current_epoch)
}
