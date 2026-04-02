use {
    aeko_sdk::{hash::Hash, pubkey::Pubkey},
    aeko_wallet_core::{
        create_wallet,
        permissions::{
            build_freeze_wallet_plan, build_grant_delegate_plan, build_initialize_permissions_plan,
            build_read_effective_permissions_instruction, sign_permission_plan_with_keystore,
            default_wallet_permissions_program_id, FreezeWalletInput, GrantDelegateInput,
            InitializePermissionsInput, PermissionStatus, ReadEffectivePermissionsInput,
            WalletPermissionAccounts,
        },
        CreateWalletInput,
    },
    aeko_wallet_permissions_program::state::{
        DelegatePermission, PermissionRole, ProgramPolicyMode, SpendLimitPolicy,
    },
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let owner_wallet = create_wallet(CreateWalletInput {
        word_count: 12,
        passphrase: String::new(),
        password: "phase4-permissions-password".to_string(),
        derivation_path: Some("m/44'/501'/0'/0'".to_string()),
    })?;

    let accounts = WalletPermissionAccounts {
        permission_state: Pubkey::new_unique(),
        audit_log: Pubkey::new_unique(),
        owner: owner_wallet.public_key,
    };

    let initialize = build_initialize_permissions_plan(InitializePermissionsInput {
        accounts: accounts.clone(),
        wallet: owner_wallet.public_key,
        did: owner_wallet.did.clone(),
        current_epoch: 10,
        default_program_policy: ProgramPolicyMode::DenyByDefault,
    });

    let delegate = Pubkey::new_unique();
    let grant = build_grant_delegate_plan(GrantDelegateInput {
        accounts: accounts.clone(),
        delegate_permission: DelegatePermission {
            delegate,
            role: PermissionRole::Spender,
            label: Some("phase4-testnet-session".to_string()),
            status: PermissionStatus::Active,
            valid_from_epoch: 10,
            valid_until_epoch: Some(40),
            spend_limit: SpendLimitPolicy {
                max_single_tx_aeko: Some(250_000),
                max_daily_aeko: Some(1_000_000),
                token_caps: Vec::new(),
            },
            program_allowlist: vec![default_wallet_permissions_program_id()],
            token_allowlist: Vec::new(),
            app_scope_hashes: Vec::new(),
            requires_reauth: false,
            last_used_epoch: None,
            last_used_slot: None,
        },
        current_epoch: 10,
        current_slot: 100,
    });

    let freeze = build_freeze_wallet_plan(FreezeWalletInput {
        accounts: accounts.clone(),
        reason_code: Some(7),
        reauth_required_until_epoch: Some(11),
        current_epoch: 10,
        current_slot: 101,
    });

    let read_effective = build_read_effective_permissions_instruction(ReadEffectivePermissionsInput {
        permission_state: accounts.permission_state,
        delegate,
        current_epoch: 10,
    });

    let initialize_tx = sign_permission_plan_with_keystore(
        &owner_wallet.keystore,
        "phase4-permissions-password",
        &initialize,
        Hash::new_unique(),
    )?;
    let grant_tx = sign_permission_plan_with_keystore(
        &owner_wallet.keystore,
        "phase4-permissions-password",
        &grant,
        Hash::new_unique(),
    )?;
    let freeze_tx = sign_permission_plan_with_keystore(
        &owner_wallet.keystore,
        "phase4-permissions-password",
        &freeze,
        Hash::new_unique(),
    )?;

    println!("permission state: {}", accounts.permission_state);
    println!("audit log: {}", accounts.audit_log);
    println!("delegate: {delegate}");
    println!("init instruction accounts: {}", initialize.instruction.accounts.len());
    println!("grant tx signatures: {}", grant_tx.signatures.len());
    println!("freeze tx signatures: {}", freeze_tx.signatures.len());
    println!("read-effective program: {}", read_effective.program_id);
    println!("init tx signatures: {}", initialize_tx.signatures.len());

    Ok(())
}
