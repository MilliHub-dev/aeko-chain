use {
    aeko_rpc_client::rpc_client::RpcClient,
    aeko_sdk::{
        pubkey::Pubkey,
        signature::{Keypair, Signer},
        system_instruction,
        transaction::Transaction,
    },
    aeko_wallet_core::{
        did_from_pubkey, import_from_keystore, EncryptedKeystore,
    },
    aeko_wallet_permissions_program::{
        instruction as wallet_permissions_instruction,
        state::{
            DelegatePermission, PermissionRole, PermissionStatus, ProgramPolicyMode, SpendLimitPolicy,
            WalletPermissionAccount, WalletPermissionAuditLogAccount,
        },
    },
    std::{env, error::Error, fs, str::FromStr},
};

const ACCOUNT_SPACE: usize = 16_384;

fn main() -> Result<(), Box<dyn Error>> {
    let rpc_url =
        env::var("AEKO_TESTNET_RPC").unwrap_or_else(|_| "https://api.testnet.aeko.chain".to_string());
    let keystore_path = required_env("AEKO_WALLET_KEYSTORE_PATH")?;
    let password = required_env("AEKO_WALLET_PASSWORD")?;
    let delegate = env::var("AEKO_DELEGATE_PUBKEY")
        .ok()
        .map(|value| Pubkey::from_str(&value))
        .transpose()?
        .unwrap_or_else(|| Keypair::new().pubkey());
    let allowed_program = env::var("AEKO_ALLOWED_PROGRAM_ID")
        .ok()
        .map(|value| Pubkey::from_str(&value))
        .transpose()?
        .unwrap_or_else(aeko_wallet_permissions_program::id);
    let permission_program_id = env::var("AEKO_WALLET_PERMISSIONS_PROGRAM_ID")
        .ok()
        .map(|value| Pubkey::from_str(&value))
        .transpose()?
        .unwrap_or_else(aeko_wallet_permissions_program::id);

    let keystore: EncryptedKeystore = serde_json::from_str(&fs::read_to_string(&keystore_path)?)?;
    let owner = import_from_keystore(&keystore, &password)?;
    let rpc_client = RpcClient::new(rpc_url.clone());
    let permission_state = Keypair::new();
    let audit_log = Keypair::new();

    let rent_exempt_lamports = rpc_client.get_minimum_balance_for_rent_exemption(ACCOUNT_SPACE)?;
    let recent_blockhash = rpc_client.get_latest_blockhash()?;

    let create_permission_accounts = Transaction::new_signed_with_payer(
        &[
            system_instruction::create_account(
                &owner.pubkey(),
                &permission_state.pubkey(),
                rent_exempt_lamports,
                ACCOUNT_SPACE as u64,
                &permission_program_id,
            ),
            system_instruction::create_account(
                &owner.pubkey(),
                &audit_log.pubkey(),
                rent_exempt_lamports,
                ACCOUNT_SPACE as u64,
                &permission_program_id,
            ),
        ],
        Some(&owner.pubkey()),
        &[&owner, &permission_state, &audit_log],
        recent_blockhash,
    );
    let create_accounts_signature = rpc_client.send_and_confirm_transaction(&create_permission_accounts)?;

    let initialize_signature = send_owner_instruction(
        &rpc_client,
        &owner,
        wallet_permissions_instruction::initialize_permission_account(
            &permission_program_id,
            &permission_state.pubkey(),
            &audit_log.pubkey(),
            &owner.pubkey(),
            owner.pubkey(),
            did_from_pubkey(&owner.pubkey()),
            10,
            ProgramPolicyMode::DenyByDefault,
        ),
    )?;

    let grant_signature = send_owner_instruction(
        &rpc_client,
        &owner,
        wallet_permissions_instruction::grant_delegate(
            &permission_program_id,
            &permission_state.pubkey(),
            &audit_log.pubkey(),
            &owner.pubkey(),
            DelegatePermission {
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
                program_allowlist: vec![allowed_program],
                token_allowlist: Vec::new(),
                app_scope_hashes: Vec::new(),
                requires_reauth: false,
                last_used_epoch: None,
                last_used_slot: None,
            },
            10,
            100,
        ),
    )?;

    let allowed_usage_signature = send_owner_instruction(
        &rpc_client,
        &owner,
        wallet_permissions_instruction::record_delegate_usage(
            &permission_program_id,
            &permission_state.pubkey(),
            &audit_log.pubkey(),
            &owner.pubkey(),
            delegate,
            Some(allowed_program),
            None,
            100_000,
            0,
            10,
            101,
        ),
    )?;

    let over_cap_result = send_owner_instruction(
        &rpc_client,
        &owner,
        wallet_permissions_instruction::record_delegate_usage(
            &permission_program_id,
            &permission_state.pubkey(),
            &audit_log.pubkey(),
            &owner.pubkey(),
            delegate,
            Some(allowed_program),
            None,
            999_999_999,
            0,
            10,
            102,
        ),
    );

    let disallowed_program = Pubkey::new_unique();
    let allowlist_rejection_result = send_owner_instruction(
        &rpc_client,
        &owner,
        wallet_permissions_instruction::record_delegate_usage(
            &permission_program_id,
            &permission_state.pubkey(),
            &audit_log.pubkey(),
            &owner.pubkey(),
            delegate,
            Some(disallowed_program),
            None,
            1,
            0,
            10,
            103,
        ),
    );

    let freeze_signature = send_owner_instruction(
        &rpc_client,
        &owner,
        wallet_permissions_instruction::freeze_wallet(
            &permission_program_id,
            &permission_state.pubkey(),
            &audit_log.pubkey(),
            &owner.pubkey(),
            Some(7),
            Some(11),
            10,
            104,
        ),
    )?;

    let unfreeze_signature = send_owner_instruction(
        &rpc_client,
        &owner,
        wallet_permissions_instruction::unfreeze_wallet(
            &permission_program_id,
            &permission_state.pubkey(),
            &audit_log.pubkey(),
            &owner.pubkey(),
            11,
            105,
        ),
    )?;

    let update_signature = send_owner_instruction(
        &rpc_client,
        &owner,
        wallet_permissions_instruction::update_delegate(
            &permission_program_id,
            &permission_state.pubkey(),
            &audit_log.pubkey(),
            &owner.pubkey(),
            delegate,
            Some(PermissionRole::Viewer),
            Some(Some("phase4-updated-session".to_string())),
            Some(Some(45)),
            None,
            Some(vec![allowed_program]),
            None,
            None,
            Some(false),
            11,
            106,
        ),
    )?;

    let revoke_signature = send_owner_instruction(
        &rpc_client,
        &owner,
        wallet_permissions_instruction::revoke_delegate(
            &permission_program_id,
            &permission_state.pubkey(),
            &audit_log.pubkey(),
            &owner.pubkey(),
            delegate,
            12,
            107,
        ),
    )?;

    let state_data = rpc_client.get_account_data(&permission_state.pubkey())?;
    let audit_log_data = rpc_client.get_account_data(&audit_log.pubkey())?;
    let state = WalletPermissionAccount::deserialize_padded(&state_data)?;
    let audit = WalletPermissionAuditLogAccount::deserialize_padded(&audit_log_data)?;

    println!("rpc url: {rpc_url}");
    println!("permissions program id: {permission_program_id}");
    println!("owner wallet: {}", owner.pubkey());
    println!("owner DID: {}", did_from_pubkey(&owner.pubkey()));
    println!("permission state: {}", permission_state.pubkey());
    println!("audit log: {}", audit_log.pubkey());
    println!("delegate: {delegate}");
    println!("create accounts tx: {create_accounts_signature}");
    println!("initialize tx: {initialize_signature}");
    println!("grant tx: {grant_signature}");
    println!("allowed usage tx: {allowed_usage_signature}");
    println!("freeze tx: {freeze_signature}");
    println!("unfreeze tx: {unfreeze_signature}");
    println!("update tx: {update_signature}");
    println!("revoke tx: {revoke_signature}");
    println!("current policy nonce: {}", state.policy_nonce);
    println!("current delegate count: {}", state.delegates.len());
    println!("audit log entries: {}", audit.entries.len());
    println!(
        "over-cap rejection: {}",
        format_result_error(over_cap_result.as_ref().err())
    );
    println!(
        "allowlist rejection: {}",
        format_result_error(allowlist_rejection_result.as_ref().err())
    );

    Ok(())
}

fn send_owner_instruction(
    rpc_client: &RpcClient,
    owner: &Keypair,
    instruction: aeko_sdk::instruction::Instruction,
) -> Result<aeko_sdk::signature::Signature, Box<dyn Error>> {
    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&owner.pubkey()),
        &[owner],
        recent_blockhash,
    );
    Ok(rpc_client.send_and_confirm_transaction(&transaction)?)
}

fn format_result_error(error: Option<&Box<dyn Error>>) -> String {
    error
        .map(|error| error.to_string())
        .unwrap_or_else(|| "unexpected success".to_string())
}

fn required_env(name: &str) -> Result<String, Box<dyn Error>> {
    env::var(name).map_err(|_| format!("missing required environment variable {name}").into())
}
