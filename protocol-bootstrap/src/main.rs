//! Idempotent bootstrap for AEKO protocol-native program state.
//!
//! The binary is deliberately feature-aware. On an established chain, the
//! validator is upgraded first with the new builtins dormant. Operators then
//! activate the two runtime features at an epoch boundary and only afterwards
//! enable this bootstrap. Missing or mismatched state on an established
//! registry fails closed unless explicit recovery is requested.

use {
    aeko_emergency_multisig_program::state::MultisigConfig,
    aeko_finality_oracle_program::state::OracleConfig,
    aeko_permission_registry_program::state::RegistryConfig,
    aeko_public_mint_program::state::{PublicMintPolicy, PublicMintState},
    aeko_revocation_registry_program::state::RevRegistryConfig,
    aeko_rpc_client::rpc_client::RpcClient,
    aeko_sdk::{
        account::ReadableAccount,
        commitment_config::CommitmentConfig,
        feature::{self, Feature},
        feature_set,
        instruction::Instruction,
        pubkey::Pubkey,
        signature::{Keypair, Signer},
        signer::keypair::{read_keypair_file, write_keypair_file},
        system_instruction, system_program,
        transaction::Transaction,
    },
    aeko_subnet_registry_program::state::SubnetRegistryConfig,
    aeko_token_20_program::state::{Aeko20Mint, MintPolicy},
    aeko_tokenomics_program::state::TokenomicsStateAccount,
    anyhow::{anyhow, Context, Result},
    std::{
        env, fs,
        path::{Path, PathBuf},
        str::FromStr,
        thread,
        time::{Duration, Instant},
    },
};

const RPC_READY_TIMEOUT: Duration = Duration::from_secs(180);
const RPC_READY_POLL_INTERVAL: Duration = Duration::from_secs(2);
const RPC_READY_MIN_SLOT: u64 = 4;
const SEND_MAX_ATTEMPTS: u32 = 12;
const SEND_BASE_BACKOFF: Duration = Duration::from_millis(750);
const SEND_MAX_BACKOFF: Duration = Duration::from_secs(8);

const TOKENOMICS_STATE_SPACE: u64 = 128 * 1024;
const REFERENCE_MINT_SPACE: u64 = 16 * 1024;
const PUBLIC_MINT_STATE_SPACE: u64 = 512 * 1024;
const REGISTRY_CONFIG_SPACE: u64 = 16 * 1024;
const MULTISIG_CONFIG_SPACE: u64 = 16 * 1024;
const ORACLE_CONFIG_SPACE: u64 = 16 * 1024;
const REGISTRY_FILE_NAME: &str = "protocol-registry.env";
const REGISTRY_ANCHOR_FILE_NAME: &str = "protocol-registry.anchor";

fn main() -> Result<()> {
    if !parse_bool_flag_with_default("AEKO_PROTOCOL_BOOTSTRAP_ENABLED", false)? {
        eprintln!(
            "aeko-protocol-bootstrap disabled; activate AEKO runtime features first, then set AEKO_PROTOCOL_BOOTSTRAP_ENABLED=1"
        );
        return Ok(());
    }

    let rpc_url = env::var("AEKO_RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string());
    let payer_path = env::var("AEKO_PAYER_KEYPAIR")
        .context("AEKO_PAYER_KEYPAIR must point at a funded keypair file")?;
    let payer = read_keypair_file(&payer_path)
        .map_err(|error| anyhow!("failed to read payer keypair at {payer_path}: {error}"))?;

    let authority_path = env::var("AEKO_PROTOCOL_AUTHORITY_KEYPAIR").context(
        "AEKO_PROTOCOL_AUTHORITY_KEYPAIR must point at the dedicated protocol authority keypair",
    )?;
    let authority = read_keypair_file(&authority_path).map_err(|error| {
        anyhow!("failed to read protocol authority keypair at {authority_path}: {error}")
    })?;

    let out_dir = PathBuf::from(
        env::var("AEKO_PROTOCOL_OUT_DIR")
            .unwrap_or_else(|_| "./local-testnet/protocol-state".to_string()),
    );
    fs::create_dir_all(&out_dir).context("creating protocol bootstrap state directory")?;
    let continuity_dir = PathBuf::from(
        env::var("AEKO_PROTOCOL_CONTINUITY_DIR")
            .unwrap_or_else(|_| "./local-testnet/protocol-continuity".to_string()),
    );
    fs::create_dir_all(&continuity_dir)
        .context("creating protocol bootstrap continuity directory")?;

    let registry_preexisted = out_dir.join(REGISTRY_FILE_NAME).is_file();
    let allow_missing_state = parse_bool_flag("AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE")?;
    let require_existing_protocol_state =
        parse_bool_flag_with_default("AEKO_REQUIRE_EXISTING_PROTOCOL_STATE", false)?;
    let allow_protocol_state_initialization =
        parse_bool_flag_with_default("AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION", false)?;
    let allow_continuity_anchor_recovery = parse_bool_flag_with_default(
        "AEKO_PROTOCOL_CONTINUITY_ALLOW_ANCHOR_RECOVERY",
        false,
    )?;

    prepare_protocol_state_continuity(
        &out_dir,
        &continuity_dir,
        require_existing_protocol_state,
        allow_protocol_state_initialization,
        allow_continuity_anchor_recovery,
        allow_missing_state,
    )?;

    let client = RpcClient::new_with_commitment(rpc_url.clone(), CommitmentConfig::confirmed());
    eprintln!("==> aeko-protocol-bootstrap");
    eprintln!("    rpc:       {rpc_url}");
    eprintln!("    payer:     {}", payer.pubkey());
    eprintln!("    authority: {}", authority.pubkey());
    eprintln!("    out-dir:   {}", out_dir.display());
    eprintln!("    continuity: {}", continuity_dir.display());

    wait_for_rpc_ready(&client)?;

    let token_feature_slot = require_feature_active(
        &client,
        &feature_set::aeko_token_programs_v1::id(),
        "aeko_token_programs_v1",
    )?;
    let permission_feature_slot = require_feature_active(
        &client,
        &feature_set::aeko_permission_layer_v1::id(),
        "aeko_permission_layer_v1",
    )?;

    for (program_id, label) in [
        (aeko_tokenomics_program::id(), "tokenomics"),
        (aeko_token_20_program::id(), "token-20"),
        (aeko_public_mint_program::id(), "public-mint"),
        (aeko_token_721_program::id(), "token-721"),
        (aeko_nft_marketplace_program::id(), "nft-marketplace"),
        (aeko_wallet_permissions_program::id(), "wallet-permissions"),
        (
            aeko_permission_registry_program::id(),
            "permission-registry",
        ),
        (
            aeko_revocation_registry_program::id(),
            "revocation-registry",
        ),
        (aeko_subnet_registry_program::id(), "subnet-registry"),
        (aeko_emergency_multisig_program::id(), "emergency-multisig"),
        (aeko_finality_oracle_program::id(), "finality-oracle"),
    ] {
        require_executable_program(&client, &program_id, label)?;
    }

    let treasury = ensure_keypair(&out_dir, "tokenomics-treasury.json")?;
    let validator_rewards = ensure_keypair(&out_dir, "validator-rewards.json")?;
    let community_rewards = ensure_keypair(&out_dir, "community-rewards.json")?;
    ensure_system_vault(&client, &payer, &treasury, "tokenomics-treasury")?;
    ensure_system_vault(&client, &payer, &validator_rewards, "validator-rewards")?;
    ensure_system_vault(&client, &payer, &community_rewards, "community-rewards")?;

    let base_fee_atomic = parse_u64("AEKO_TOKENOMICS_BASE_FEE_ATOMIC", 250_000)?;

    let tokenomics_state = ensure_keypair(&out_dir, "tokenomics-state.json")?;
    let tokenomics_defaults = TokenomicsStateAccount::signed_off_defaults(
        authority.pubkey(),
        treasury.pubkey(),
        validator_rewards.pubkey(),
        community_rewards.pubkey(),
        authority.pubkey(),
        treasury.pubkey(),
        base_fee_atomic,
    );
    let expected_authority = authority.pubkey();
    let expected_treasury = treasury.pubkey();
    let expected_validator_rewards = validator_rewards.pubkey();
    let expected_community_rewards = community_rewards.pubkey();
    create_and_init(
        &client,
        &payer,
        &authority,
        &tokenomics_state,
        &aeko_tokenomics_program::id(),
        TOKENOMICS_STATE_SPACE,
        aeko_tokenomics_program::instruction::initialize_account(
            &aeko_tokenomics_program::id(),
            &tokenomics_state.pubkey(),
            &payer.pubkey(),
            &authority.pubkey(),
            tokenomics_defaults,
        ),
        "tokenomics",
        registry_preexisted,
        allow_missing_state,
        move |data| {
            let state = TokenomicsStateAccount::deserialize_padded(data)
                .map_err(|_| anyhow!("invalid tokenomics state"))?;
            Ok(state.is_initialized
                && state.config.authority == expected_authority
                && state.config.governance_program_id == expected_authority
                && state.config.treasury_account == expected_treasury
                && state.config.validator_rewards_account == expected_validator_rewards
                && state.config.community_rewards_account == expected_community_rewards)
        },
    )?;

    let reference_mint = ensure_keypair(&out_dir, "aeko20-reference-mint.json")?;
    let reference_name =
        env::var("AEKO_REFERENCE_MINT_NAME").unwrap_or_else(|_| "AEKO-20 Testnet Reference".into());
    let reference_symbol = env::var("AEKO_REFERENCE_MINT_SYMBOL").unwrap_or_else(|_| "A20T".into());
    let reference_decimals = parse_u8("AEKO_REFERENCE_MINT_DECIMALS", 9)?;
    let mint_authority = authority.pubkey();
    let expected_name = reference_name.clone();
    let expected_symbol = reference_symbol.clone();
    create_and_init(
        &client,
        &payer,
        &authority,
        &reference_mint,
        &aeko_token_20_program::id(),
        REFERENCE_MINT_SPACE,
        aeko_token_20_program::instruction::initialize_mint(
            &aeko_token_20_program::id(),
            &reference_mint.pubkey(),
            &authority.pubkey(),
            reference_name,
            reference_symbol,
            reference_decimals,
            None,
            None,
            MintPolicy::PublicMintControlled,
        ),
        "aeko20-reference-mint",
        registry_preexisted,
        allow_missing_state,
        move |data| {
            let mint = Aeko20Mint::deserialize_padded(data)
                .map_err(|_| anyhow!("invalid AEKO-20 reference mint"))?;
            Ok(mint.is_initialized
                && mint.mint_authority == Some(mint_authority)
                && mint.freeze_authority == Some(mint_authority)
                && mint.name == expected_name
                && mint.symbol == expected_symbol
                && mint.decimals == reference_decimals
                && mint.mint_policy == MintPolicy::PublicMintControlled)
        },
    )?;

    let public_mint_state = ensure_keypair(&out_dir, "public-mint-state.json")?;
    let per_wallet_limit = parse_u128("AEKO_PUBLIC_MINT_PER_WALLET_LIMIT", 1_000_000_000_000)?;
    let window_epochs = parse_u64("AEKO_PUBLIC_MINT_WINDOW_EPOCHS", 30)?;
    let cooldown_epochs = parse_u64("AEKO_PUBLIC_MINT_COOLDOWN_EPOCHS", 1)?;
    let anomaly_threshold = parse_u32("AEKO_PUBLIC_MINT_ANOMALY_THRESHOLD", 3)?;
    let requires_allowlist =
        parse_bool_flag_with_default("AEKO_PUBLIC_MINT_REQUIRES_ALLOWLIST", false)?;
    let public_mint_enabled = parse_bool_flag_with_default("AEKO_PUBLIC_MINT_ENABLED", true)?;
    let public_policy = PublicMintPolicy {
        mint: reference_mint.pubkey(),
        authority: authority.pubkey(),
        enabled: public_mint_enabled,
        per_wallet_limit,
        window_epochs,
        cooldown_epochs,
        requires_allowlist,
        anomaly_threshold,
        fee_subsidy_enabled: false,
        subsidy_app: None,
        is_initialized: true,
    };
    let public_state = PublicMintState {
        policy: public_policy.clone(),
        wallet_windows: Vec::new(),
        blocklist: Vec::new(),
        allowlist: Vec::new(),
    };
    let expected_policy = public_policy.clone();
    create_and_init(
        &client,
        &payer,
        &authority,
        &public_mint_state,
        &aeko_public_mint_program::id(),
        PUBLIC_MINT_STATE_SPACE,
        aeko_public_mint_program::instruction::initialize_policy(
            &aeko_public_mint_program::id(),
            &public_mint_state.pubkey(),
            &authority.pubkey(),
            public_state,
        ),
        "public-mint",
        registry_preexisted,
        allow_missing_state,
        move |data| {
            let state = PublicMintState::deserialize_padded(data)
                .map_err(|_| anyhow!("invalid public-mint state"))?;
            Ok(state.policy == expected_policy)
        },
    )?;

    let current_slot = with_retries("getSlot", || client.get_slot().map_err(anyhow::Error::from))?;

    let permission_registry = ensure_keypair(&out_dir, "permission-registry-state.json")?;
    let permission_authority = authority.pubkey();
    create_and_init(
        &client,
        &payer,
        &authority,
        &permission_registry,
        &aeko_permission_registry_program::id(),
        REGISTRY_CONFIG_SPACE,
        aeko_permission_registry_program::instruction::initialize_registry(
            &aeko_permission_registry_program::id(),
            &permission_registry.pubkey(),
            &authority.pubkey(),
            current_slot,
        ),
        "permission-registry",
        registry_preexisted,
        allow_missing_state,
        move |data| {
            let state = RegistryConfig::deserialize_padded(data)
                .map_err(|_| anyhow!("invalid permission-registry state"))?;
            Ok(state.is_initialized && state.upgrade_authority == permission_authority)
        },
    )?;

    let revocation_registry = ensure_keypair(&out_dir, "revocation-registry-state.json")?;
    let revocation_authority = authority.pubkey();
    create_and_init(
        &client,
        &payer,
        &authority,
        &revocation_registry,
        &aeko_revocation_registry_program::id(),
        REGISTRY_CONFIG_SPACE,
        aeko_revocation_registry_program::instruction::initialize_registry(
            &aeko_revocation_registry_program::id(),
            &revocation_registry.pubkey(),
            &authority.pubkey(),
            current_slot,
        ),
        "revocation-registry",
        registry_preexisted,
        allow_missing_state,
        move |data| {
            let state = RevRegistryConfig::deserialize_padded(data)
                .map_err(|_| anyhow!("invalid revocation-registry state"))?;
            Ok(state.is_initialized && state.upgrade_authority == revocation_authority)
        },
    )?;

    let subnet_registry = ensure_keypair(&out_dir, "subnet-registry-state.json")?;
    let subnet_authority = authority.pubkey();
    create_and_init(
        &client,
        &payer,
        &authority,
        &subnet_registry,
        &aeko_subnet_registry_program::id(),
        REGISTRY_CONFIG_SPACE,
        aeko_subnet_registry_program::instruction::initialize_registry(
            &aeko_subnet_registry_program::id(),
            &subnet_registry.pubkey(),
            &authority.pubkey(),
            current_slot,
        ),
        "subnet-registry",
        registry_preexisted,
        allow_missing_state,
        move |data| {
            let state = SubnetRegistryConfig::deserialize_padded(data)
                .map_err(|_| anyhow!("invalid subnet-registry state"))?;
            Ok(state.is_initialized && state.upgrade_authority == subnet_authority)
        },
    )?;

    let (multisig_signers, freeze_quorum, revoke_quorum, policy_quorum) =
        parse_multisig_config(authority.pubkey())?;
    let emergency_multisig = ensure_keypair(&out_dir, "emergency-multisig-state.json")?;
    let multisig_authority = authority.pubkey();
    let expected_signers = multisig_signers.clone();
    create_and_init(
        &client,
        &payer,
        &authority,
        &emergency_multisig,
        &aeko_emergency_multisig_program::id(),
        MULTISIG_CONFIG_SPACE,
        aeko_emergency_multisig_program::instruction::initialize_multisig(
            &aeko_emergency_multisig_program::id(),
            &emergency_multisig.pubkey(),
            &authority.pubkey(),
            multisig_signers,
            freeze_quorum,
            revoke_quorum,
            policy_quorum,
            current_slot,
        ),
        "emergency-multisig",
        registry_preexisted,
        allow_missing_state,
        move |data| {
            let state = MultisigConfig::deserialize_padded(data)
                .map_err(|_| anyhow!("invalid emergency-multisig state"))?;
            Ok(state.is_initialized
                && state.upgrade_authority == multisig_authority
                && state.signers == expected_signers
                && state.freeze_quorum == freeze_quorum
                && state.revoke_quorum == revoke_quorum
                && state.policy_quorum == policy_quorum)
        },
    )?;

    let finality_oracle = ensure_keypair(&out_dir, "finality-oracle-state.json")?;
    let finality_authority = authority.pubkey();
    create_and_init(
        &client,
        &payer,
        &authority,
        &finality_oracle,
        &aeko_finality_oracle_program::id(),
        ORACLE_CONFIG_SPACE,
        aeko_finality_oracle_program::instruction::initialize_oracle(
            &aeko_finality_oracle_program::id(),
            &finality_oracle.pubkey(),
            &authority.pubkey(),
            current_slot,
        ),
        "finality-oracle",
        registry_preexisted,
        allow_missing_state,
        move |data| {
            let state = OracleConfig::deserialize_padded(data)
                .map_err(|_| anyhow!("invalid finality-oracle state"))?;
            Ok(state.is_initialized && state.upgrade_authority == finality_authority)
        },
    )?;

    let registry = format!(
        "# Generated by aeko-protocol-bootstrap. Do not edit by hand.\n\
AEKO_PROTOCOL_AUTHORITY={}\n\
AEKO_TOKEN_PROGRAMS_FEATURE={}\n\
AEKO_TOKEN_PROGRAMS_FEATURE_ACTIVATED_AT={}\n\
AEKO_PERMISSION_LAYER_FEATURE={}\n\
AEKO_PERMISSION_LAYER_FEATURE_ACTIVATED_AT={}\n\
AEKO_TOKENOMICS_PROGRAM_ID={}\n\
AEKO_TOKEN_20_PROGRAM_ID={}\n\
AEKO_PUBLIC_MINT_PROGRAM_ID={}\n\
AEKO_TOKEN_721_PROGRAM_ID={}\n\
AEKO_NFT_MARKETPLACE_PROGRAM_ID={}\n\
AEKO_WALLET_PERMISSIONS_PROGRAM_ID={}\n\
AEKO_PERMISSION_REGISTRY_PROGRAM_ID={}\n\
AEKO_REVOCATION_REGISTRY_PROGRAM_ID={}\n\
AEKO_SUBNET_REGISTRY_PROGRAM_ID={}\n\
AEKO_EMERGENCY_MULTISIG_PROGRAM_ID={}\n\
AEKO_FINALITY_ORACLE_PROGRAM_ID={}\n\
AEKO_TOKENOMICS_STATE={}\n\
AEKO_TOKENOMICS_TREASURY_ACCOUNT={}\n\
AEKO_VALIDATOR_REWARDS_ACCOUNT={}\n\
AEKO_COMMUNITY_REWARDS_ACCOUNT={}\n\
AEKO_AEKO20_REFERENCE_MINT={}\n\
AEKO_PUBLIC_MINT_STATE={}\n\
AEKO_PERMISSION_REGISTRY_STATE={}\n\
AEKO_REVOCATION_REGISTRY_STATE={}\n\
AEKO_SUBNET_REGISTRY_STATE={}\n\
AEKO_EMERGENCY_MULTISIG_STATE={}\n\
AEKO_FINALITY_ORACLE_STATE={}\n",
        authority.pubkey(),
        feature_set::aeko_token_programs_v1::id(),
        token_feature_slot,
        feature_set::aeko_permission_layer_v1::id(),
        permission_feature_slot,
        aeko_tokenomics_program::id(),
        aeko_token_20_program::id(),
        aeko_public_mint_program::id(),
        aeko_token_721_program::id(),
        aeko_nft_marketplace_program::id(),
        aeko_wallet_permissions_program::id(),
        aeko_permission_registry_program::id(),
        aeko_revocation_registry_program::id(),
        aeko_subnet_registry_program::id(),
        aeko_emergency_multisig_program::id(),
        aeko_finality_oracle_program::id(),
        tokenomics_state.pubkey(),
        treasury.pubkey(),
        validator_rewards.pubkey(),
        community_rewards.pubkey(),
        reference_mint.pubkey(),
        public_mint_state.pubkey(),
        permission_registry.pubkey(),
        revocation_registry.pubkey(),
        subnet_registry.pubkey(),
        emergency_multisig.pubkey(),
        finality_oracle.pubkey(),
    );
    write_registry_file(&out_dir, &registry)?;
    write_continuity_anchor(&continuity_dir, &registry)?;
    println!("# Canonical AEKO protocol registry:");
    print!("{registry}");
    Ok(())
}

fn require_feature_active(client: &RpcClient, feature_id: &Pubkey, label: &str) -> Result<u64> {
    let account = with_retries(&format!("{label}:getAccount"), || {
        client
            .get_account_with_commitment(feature_id, CommitmentConfig::confirmed())
            .map_err(anyhow::Error::from)
    })?
    .value
    .ok_or_else(|| {
        anyhow!(
            "[{label}] feature account {feature_id} is missing; activate it with the corresponding offline feature authority"
        )
    })?;
    validate_feature_account(&account, feature_id, label)
}

fn validate_feature_account<T: ReadableAccount>(
    account: &T,
    feature_id: &Pubkey,
    label: &str,
) -> Result<u64> {
    if account.owner() != &feature::id() {
        return Err(anyhow!(
            "[{label}] feature account {feature_id} owner {} does not match {}",
            account.owner(),
            feature::id()
        ));
    }
    let feature: Feature =
        bincode::deserialize(account.data()).context("deserializing runtime feature account")?;
    feature.activated_at.ok_or_else(|| {
        anyhow!(
            "[{label}] feature {feature_id} is pending; wait for the next epoch before bootstrapping protocol state"
        )
    })
}
fn require_executable_program(client: &RpcClient, program_id: &Pubkey, label: &str) -> Result<()> {
    let account = with_retries(&format!("{label}:getAccount"), || {
        client
            .get_account_with_commitment(program_id, CommitmentConfig::confirmed())
            .map_err(anyhow::Error::from)
    })?
    .value
    .ok_or_else(|| anyhow!("[{label}] native program account {program_id} is missing"))?;
    if !account.executable {
        return Err(anyhow!(
            "[{label}] native program account {program_id} is not executable"
        ));
    }
    Ok(())
}

fn ensure_system_vault(
    client: &RpcClient,
    payer: &Keypair,
    vault: &Keypair,
    label: &str,
) -> Result<()> {
    let pubkey = vault.pubkey();
    let rent = with_retries(&format!("{label}:rent"), || {
        client
            .get_minimum_balance_for_rent_exemption(0)
            .map_err(anyhow::Error::from)
    })?;
    match with_retries(&format!("{label}:getAccount"), || {
        client
            .get_account_with_commitment(&pubkey, CommitmentConfig::confirmed())
            .map_err(anyhow::Error::from)
    })?
    .value
    {
        Some(account) => {
            if account.owner != system_program::id() {
                return Err(anyhow!(
                    "[{label}] account {pubkey} owner {} does not match system program",
                    account.owner
                ));
            }
            if !account.data.is_empty() {
                return Err(anyhow!("[{label}] account {pubkey} must have zero data"));
            }
            if account.lamports < rent {
                submit_instruction(
                    client,
                    payer,
                    &[payer],
                    system_instruction::transfer(
                        &payer.pubkey(),
                        &pubkey,
                        rent.saturating_sub(account.lamports),
                    ),
                    &format!("top up {label}"),
                )?;
            }
            Ok(())
        }
        None => submit_instruction(
            client,
            payer,
            &[payer, vault],
            system_instruction::create_account(
                &payer.pubkey(),
                &pubkey,
                rent,
                0,
                &system_program::id(),
            ),
            &format!("create {label}"),
        ),
    }
}

#[allow(clippy::too_many_arguments)]
fn create_and_init<F>(
    client: &RpcClient,
    payer: &Keypair,
    authority: &Keypair,
    state: &Keypair,
    program_id: &Pubkey,
    space: u64,
    init_ix: Instruction,
    label: &str,
    registry_preexisted: bool,
    allow_missing_state: bool,
    verifier: F,
) -> Result<()>
where
    F: Fn(&[u8]) -> Result<bool>,
{
    let state_pubkey = state.pubkey();
    if existing_state_is_valid(client, &state_pubkey, program_id, label, &verifier)? {
        eprintln!("[{label}] existing initialized state verified");
        return Ok(());
    }
    if registry_preexisted && !allow_missing_state {
        return Err(anyhow!(
            "[{label}] state {state_pubkey} is missing while {REGISTRY_FILE_NAME} exists; set AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE=1 only for intentional recovery"
        ));
    }

    let rent = with_retries(&format!("{label}:rent"), || {
        client
            .get_minimum_balance_for_rent_exemption(space as usize)
            .map_err(anyhow::Error::from)
    })?;
    let instructions = vec![
        system_instruction::create_account(&payer.pubkey(), &state_pubkey, rent, space, program_id),
        init_ix,
    ];
    let signers: Vec<&Keypair> = vec![payer, authority, state];
    let mut last_error = None;
    for attempt in 1..=SEND_MAX_ATTEMPTS {
        let blockhash = match client.get_latest_blockhash() {
            Ok(value) => value,
            Err(error) => {
                last_error = Some(anyhow!("getLatestBlockhash failed: {error}"));
                sleep_backoff(attempt);
                continue;
            }
        };
        let tx = Transaction::new_signed_with_payer(
            &instructions,
            Some(&payer.pubkey()),
            &signers,
            blockhash,
        );
        match client.send_and_confirm_transaction(&tx) {
            Ok(signature) => {
                eprintln!("[{label}] init confirmed {signature}");
                return Ok(());
            }
            Err(error) => {
                if existing_state_is_valid(client, &state_pubkey, program_id, label, &verifier)
                    .unwrap_or(false)
                {
                    return Ok(());
                }
                last_error = Some(anyhow!("[{label}] init failed: {error}"));
                sleep_backoff(attempt);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow!("[{label}] exhausted retries")))
}

fn existing_state_is_valid<F>(
    client: &RpcClient,
    state_pubkey: &Pubkey,
    program_id: &Pubkey,
    label: &str,
    verifier: &F,
) -> Result<bool>
where
    F: Fn(&[u8]) -> Result<bool>,
{
    let response = with_retries(&format!("{label}:getAccount"), || {
        client
            .get_account_with_commitment(state_pubkey, CommitmentConfig::confirmed())
            .map_err(anyhow::Error::from)
    })?;
    validate_existing_state_account(
        response.value.as_ref(),
        state_pubkey,
        program_id,
        label,
        verifier,
    )
}

fn validate_existing_state_account<T, F>(
    account: Option<&T>,
    state_pubkey: &Pubkey,
    program_id: &Pubkey,
    label: &str,
    verifier: &F,
) -> Result<bool>
where
    T: ReadableAccount,
    F: Fn(&[u8]) -> Result<bool>,
{
    match account {
        None => Ok(false),
        Some(account) if account.owner() != program_id => Err(anyhow!(
            "[{label}] state {state_pubkey} owner {} does not match {program_id}",
            account.owner()
        )),
        Some(account) if verifier(account.data())? => Ok(true),
        Some(_) => Err(anyhow!(
            "[{label}] state {state_pubkey} exists but does not match the canonical bootstrap configuration"
        )),
    }
}
fn submit_instruction(
    client: &RpcClient,
    payer: &Keypair,
    signers: &[&Keypair],
    instruction: Instruction,
    label: &str,
) -> Result<()> {
    let mut last_error = None;
    for attempt in 1..=SEND_MAX_ATTEMPTS {
        let blockhash = match client.get_latest_blockhash() {
            Ok(value) => value,
            Err(error) => {
                last_error = Some(anyhow!("{label}: getLatestBlockhash failed: {error}"));
                sleep_backoff(attempt);
                continue;
            }
        };
        let tx = Transaction::new_signed_with_payer(
            &[instruction.clone()],
            Some(&payer.pubkey()),
            signers,
            blockhash,
        );
        match client.send_and_confirm_transaction(&tx) {
            Ok(signature) => {
                eprintln!("[{label}] confirmed {signature}");
                return Ok(());
            }
            Err(error) => {
                last_error = Some(anyhow!("[{label}] attempt {attempt} failed: {error}"));
                sleep_backoff(attempt);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow!("[{label}] exhausted retries")))
}

fn ensure_keypair(out_dir: &Path, file_name: &str) -> Result<Keypair> {
    let path = out_dir.join(file_name);
    if path.exists() {
        read_keypair_file(&path)
            .map_err(|error| anyhow!("failed to read {}: {error}", path.display()))
    } else {
        let keypair = Keypair::new();
        write_keypair_file(&keypair, &path)
            .map_err(|error| anyhow!("failed to write {}: {error}", path.display()))?;
        Ok(keypair)
    }
}

fn parse_multisig_config(authority: Pubkey) -> Result<(Vec<Pubkey>, u8, u8, u8)> {
    let mut signers = match env::var("AEKO_PROTOCOL_MULTISIG_SIGNERS") {
        Ok(value) if !value.trim().is_empty() => value
            .split(',')
            .map(|value| {
                Pubkey::from_str(value.trim()).with_context(|| {
                    format!("invalid pubkey in AEKO_PROTOCOL_MULTISIG_SIGNERS: {value:?}")
                })
            })
            .collect::<Result<Vec<_>>>()?,
        _ => vec![authority],
    };
    if !signers.contains(&authority) {
        signers.push(authority);
    }
    let mut unique = Vec::new();
    for signer in signers {
        if !unique.contains(&signer) {
            unique.push(signer);
        }
    }
    if unique.is_empty() || unique.len() > aeko_emergency_multisig_program::state::MAX_SIGNERS {
        return Err(anyhow!(
            "AEKO protocol multisig requires 1..={} unique signers",
            aeko_emergency_multisig_program::state::MAX_SIGNERS
        ));
    }
    let freeze = parse_u8("AEKO_PROTOCOL_MULTISIG_FREEZE_QUORUM", 1)?;
    let revoke = parse_u8("AEKO_PROTOCOL_MULTISIG_REVOKE_QUORUM", 1)?;
    let policy = parse_u8("AEKO_PROTOCOL_MULTISIG_POLICY_QUORUM", 1)?;
    let max = unique.len() as u8;
    for (label, value) in [("freeze", freeze), ("revoke", revoke), ("policy", policy)] {
        if value == 0 || value > max {
            return Err(anyhow!(
                "{label} quorum {value} must be between 1 and signer count {max}"
            ));
        }
    }
    Ok((unique, freeze, revoke, policy))
}

fn parse_bool_flag(name: &str) -> Result<bool> {
    parse_bool_flag_with_default(name, false)
}

fn parse_bool_flag_with_default(name: &str, default: bool) -> Result<bool> {
    match env::var(name) {
        Ok(value) => match value.trim().to_ascii_lowercase().as_str() {
            "" => Ok(default),
            "0" | "false" | "no" | "off" => Ok(false),
            "1" | "true" | "yes" | "on" => Ok(true),
            _ => Err(anyhow!("{name} must be boolean")),
        },
        Err(env::VarError::NotPresent) => Ok(default),
        Err(error) => Err(anyhow!("failed to read {name}: {error}")),
    }
}

fn parse_u8(name: &str, default: u8) -> Result<u8> {
    env::var(name)
        .unwrap_or_else(|_| default.to_string())
        .parse::<u8>()
        .with_context(|| format!("{name} must be a u8"))
}

fn parse_u32(name: &str, default: u32) -> Result<u32> {
    env::var(name)
        .unwrap_or_else(|_| default.to_string())
        .parse::<u32>()
        .with_context(|| format!("{name} must be a u32"))
}

fn parse_u64(name: &str, default: u64) -> Result<u64> {
    env::var(name)
        .unwrap_or_else(|_| default.to_string())
        .parse::<u64>()
        .with_context(|| format!("{name} must be a u64"))
}

fn parse_u128(name: &str, default: u128) -> Result<u128> {
    env::var(name)
        .unwrap_or_else(|_| default.to_string())
        .parse::<u128>()
        .with_context(|| format!("{name} must be a u128"))
}

fn read_optional_text(path: &Path) -> Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error).with_context(|| format!("reading {}", path.display())),
    }
}

fn prepare_protocol_state_continuity(
    out_dir: &Path,
    continuity_dir: &Path,
    require_existing: bool,
    allow_initialization: bool,
    allow_anchor_recovery: bool,
    allow_missing_state: bool,
) -> Result<()> {
    let registry_path = out_dir.join(REGISTRY_FILE_NAME);
    let anchor_path = continuity_dir.join(REGISTRY_ANCHOR_FILE_NAME);
    let registry = read_optional_text(&registry_path)?;
    let anchor = read_optional_text(&anchor_path)?;

    match (registry, anchor) {
        (Some(registry), Some(anchor)) if registry == anchor => Ok(()),
        (Some(_), Some(_)) => Err(anyhow!(
            "protocol registry and continuity anchor disagree; restore the correct persisted volumes before bootstrapping"
        )),
        (Some(registry), None) if allow_anchor_recovery => {
            write_continuity_anchor(continuity_dir, &registry)?;
            Ok(())
        }
        (Some(_), None) => Err(anyhow!(
            "protocol registry exists but continuity anchor is missing; restore the continuity volume or set AEKO_PROTOCOL_CONTINUITY_ALLOW_ANCHOR_RECOVERY=1 only after independently verifying the existing registry"
        )),
        (None, Some(_)) if allow_missing_state => Ok(()),
        (None, Some(_)) => Err(anyhow!(
            "protocol continuity anchor exists but protocol-registry.env is missing; refusing to create replacement canonical state unless AEKO_PROTOCOL_BOOTSTRAP_ALLOW_MISSING_STATE=1 is explicitly set for intentional recovery"
        )),
        (None, None) if require_existing && !allow_initialization => Err(anyhow!(
            "no established protocol state was found; set AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION=1 only for the intentional first protocol bootstrap"
        )),
        (None, None) => Ok(()),
    }
}

fn write_registry_file(out_dir: &Path, contents: &str) -> Result<()> {
    write_atomic_text_file(&out_dir.join(REGISTRY_FILE_NAME), contents)
}

fn write_continuity_anchor(continuity_dir: &Path, contents: &str) -> Result<()> {
    write_atomic_text_file(&continuity_dir.join(REGISTRY_ANCHOR_FILE_NAME), contents)
}

fn write_atomic_text_file(target: &Path, contents: &str) -> Result<()> {
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| anyhow!("invalid output file path {}", target.display()))?;
    let temp = target.with_file_name(format!("{file_name}.tmp"));
    fs::write(&temp, contents).with_context(|| format!("writing {}", temp.display()))?;
    fs::rename(&temp, target).with_context(|| format!("publishing {}", target.display()))?;
    Ok(())
}
fn wait_for_rpc_ready(client: &RpcClient) -> Result<()> {
    let start = Instant::now();
    loop {
        match client.get_slot() {
            Ok(slot) if slot >= RPC_READY_MIN_SLOT => {
                eprintln!("rpc ready at slot {slot}");
                return Ok(());
            }
            _ if start.elapsed() > RPC_READY_TIMEOUT => {
                return Err(anyhow!(
                    "RPC did not become ready within {RPC_READY_TIMEOUT:?}"
                ));
            }
            _ => thread::sleep(RPC_READY_POLL_INTERVAL),
        }
    }
}

fn with_retries<T, F: FnMut() -> Result<T>>(label: &str, mut operation: F) -> Result<T> {
    let mut last_error = None;
    for attempt in 1..=SEND_MAX_ATTEMPTS {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error) => {
                eprintln!("[{label}] attempt {attempt}/{SEND_MAX_ATTEMPTS}: {error}");
                last_error = Some(error);
                sleep_backoff(attempt);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow!("[{label}] exhausted retries")))
}

fn sleep_backoff(attempt: u32) {
    let backoff = SEND_BASE_BACKOFF
        .checked_mul(1u32 << attempt.min(4))
        .unwrap_or(SEND_MAX_BACKOFF)
        .min(SEND_MAX_BACKOFF);
    thread::sleep(backoff);
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        aeko_sdk::account::AccountSharedData,
        tempfile::TempDir,
    };

    fn test_account(owner: Pubkey, data: &[u8]) -> AccountSharedData {
        let mut account = AccountSharedData::new(1, data.len(), &owner);
        account.set_data_from_slice(data);
        account
    }

    #[test]
    fn feature_validation_accepts_active_feature() {
        let feature_id = Pubkey::new_unique();
        let account = feature::create_account(
            &Feature {
                activated_at: Some(42),
            },
            1,
        );
        assert_eq!(
            validate_feature_account(&account, &feature_id, "test-feature").unwrap(),
            42
        );
    }

    #[test]
    fn feature_validation_rejects_pending_and_wrong_owner() {
        let feature_id = Pubkey::new_unique();
        let pending = feature::create_account(&Feature::default(), 1);
        assert!(validate_feature_account(&pending, &feature_id, "test-feature")
            .unwrap_err()
            .to_string()
            .contains("pending"));

        let wrong_owner = test_account(Pubkey::new_unique(), pending.data());
        assert!(validate_feature_account(&wrong_owner, &feature_id, "test-feature")
            .unwrap_err()
            .to_string()
            .contains("owner"));
    }

    #[test]
    fn state_validation_is_idempotent_and_fails_closed_on_mismatch() {
        let state_pubkey = Pubkey::new_unique();
        let program_id = Pubkey::new_unique();
        let valid = test_account(program_id, b"canonical");

        assert!(validate_existing_state_account(
            Some(&valid),
            &state_pubkey,
            &program_id,
            "test-state",
            &|data| Ok(data == b"canonical"),
        )
        .unwrap());
        assert!(!validate_existing_state_account::<AccountSharedData, _>(
            None,
            &state_pubkey,
            &program_id,
            "test-state",
            &|_| Ok(true),
        )
        .unwrap());

        let wrong_owner = test_account(Pubkey::new_unique(), b"canonical");
        assert!(validate_existing_state_account(
            Some(&wrong_owner),
            &state_pubkey,
            &program_id,
            "test-state",
            &|_| Ok(true),
        )
        .is_err());

        assert!(validate_existing_state_account(
            Some(&valid),
            &state_pubkey,
            &program_id,
            "test-state",
            &|_| Ok(false),
        )
        .unwrap_err()
        .to_string()
        .contains("canonical bootstrap configuration"));
    }

    #[test]
    fn continuity_requires_explicit_first_bootstrap_when_configured() {
        let state = TempDir::new().unwrap();
        let continuity = TempDir::new().unwrap();

        let error = prepare_protocol_state_continuity(
            state.path(),
            continuity.path(),
            true,
            false,
            false,
            false,
        )
        .unwrap_err();
        assert!(error
            .to_string()
            .contains("AEKO_ALLOW_PROTOCOL_STATE_INITIALIZATION=1"));

        prepare_protocol_state_continuity(
            state.path(),
            continuity.path(),
            true,
            true,
            false,
            false,
        )
        .unwrap();
    }

    #[test]
    fn continuity_detects_lost_state_volume_and_registry_mismatch() {
        let state = TempDir::new().unwrap();
        let continuity = TempDir::new().unwrap();
        write_continuity_anchor(continuity.path(), "registry-v1").unwrap();

        assert!(prepare_protocol_state_continuity(
            state.path(),
            continuity.path(),
            true,
            false,
            false,
            false,
        )
        .unwrap_err()
        .to_string()
        .contains("protocol-registry.env is missing"));

        fs::write(state.path().join(REGISTRY_FILE_NAME), "registry-v2").unwrap();
        assert!(prepare_protocol_state_continuity(
            state.path(),
            continuity.path(),
            true,
            false,
            false,
            false,
        )
        .unwrap_err()
        .to_string()
        .contains("disagree"));
    }

    #[test]
    fn continuity_reuses_matching_state_and_requires_explicit_anchor_recovery() {
        let state = TempDir::new().unwrap();
        let continuity = TempDir::new().unwrap();
        fs::write(state.path().join(REGISTRY_FILE_NAME), "registry-v1").unwrap();

        assert!(prepare_protocol_state_continuity(
            state.path(),
            continuity.path(),
            true,
            false,
            false,
            false,
        )
        .is_err());

        prepare_protocol_state_continuity(
            state.path(),
            continuity.path(),
            true,
            false,
            true,
            false,
        )
        .unwrap();
        prepare_protocol_state_continuity(
            state.path(),
            continuity.path(),
            true,
            false,
            false,
            false,
        )
        .unwrap();
    }

    #[test]
    fn continuity_allows_missing_state_only_for_explicit_recovery() {
        let state = TempDir::new().unwrap();
        let continuity = TempDir::new().unwrap();
        write_continuity_anchor(continuity.path(), "registry-v1").unwrap();

        prepare_protocol_state_continuity(
            state.path(),
            continuity.path(),
            true,
            false,
            false,
            true,
        )
        .unwrap();
    }
}

