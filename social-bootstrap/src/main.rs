//! Bootstraps and repairs the canonical AEKO SocialFi state registry.
//!
//! Economic Social programs must never debit arbitrary system-owned wallets.
//! This bootstrap therefore owns the complete lifecycle of dedicated zero-data
//! vault accounts owned by the program that is allowed to debit them. Existing
//! PR-26 state is migrated in place through authority-only additive instructions;
//! no fresh genesis or destructive state recreation is required.

use {
    aeko_rpc_client::rpc_client::RpcClient,
    aeko_sdk::{
        commitment_config::CommitmentConfig,
        instruction::Instruction,
        pubkey::Pubkey,
        signature::{Keypair, Signer},
        signer::keypair::{read_keypair_file, write_keypair_file},
        system_instruction,
        transaction::Transaction,
    },
    anyhow::{anyhow, Context, Result},
    std::{
        env, fs,
        path::{Path, PathBuf},
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
const STATE_ACCOUNT_SPACE: u64 = 64 * 1024;
const REGISTRY_FILE_NAME: &str = "social-registry.env";

fn main() -> Result<()> {
    let rpc_url = env::var("AEKO_RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string());
    let payer_path = env::var("AEKO_PAYER_KEYPAIR").context("AEKO_PAYER_KEYPAIR must point at a funded keypair file")?;
    let payer = read_keypair_file(&payer_path).map_err(|error| anyhow!("failed to read payer keypair at {payer_path}: {error}"))?;
    let authority = match env::var("AEKO_AUTHORITY_KEYPAIR") {
        Ok(path) if !path.trim().is_empty() => read_keypair_file(path.trim()).map_err(|error| anyhow!("failed to read authority keypair at {path}: {error}"))?,
        _ => Keypair::from_bytes(&payer.to_bytes()).expect("payer keypair round-trip"),
    };
    let out_dir = PathBuf::from(env::var("AEKO_BOOTSTRAP_OUT_DIR").unwrap_or_else(|_| "./local-testnet/social-state".to_string()));
    fs::create_dir_all(&out_dir).context("creating Social bootstrap state directory")?;
    let registry_preexisted = out_dir.join(REGISTRY_FILE_NAME).is_file();
    let allow_missing_state = parse_bool_flag("AEKO_BOOTSTRAP_ALLOW_MISSING_STATE")?;
    let platform_fee_bps = parse_platform_fee_bps()?;

    let client = RpcClient::new_with_commitment(rpc_url.clone(), CommitmentConfig::confirmed());
    eprintln!("==> aeko-social-bootstrap");
    eprintln!("    rpc:       {rpc_url}");
    eprintln!("    payer:     {}", payer.pubkey());
    eprintln!("    authority: {}", authority.pubkey());
    eprintln!("    out-dir:   {}", out_dir.display());
    wait_for_rpc_ready(&client)?;

    let state_rent = with_retries("state rent", || client.get_minimum_balance_for_rent_exemption(STATE_ACCOUNT_SPACE as usize).map_err(anyhow::Error::from))?;
    let vault_rent = with_retries("vault rent", || client.get_minimum_balance_for_rent_exemption(0).map_err(anyhow::Error::from))?;

    // Dedicated program-owned economic vaults. These are persisted keypairs so
    // the bootstrap is restart-safe and can migrate an already established chain.
    let rewards_treasury = ensure_keypair(&out_dir, "social-rewards-treasury.json")?;
    let rewards_vault = ensure_keypair(&out_dir, "social-rewards-vault.json")?;
    let stake_vault = ensure_keypair(&out_dir, "social-staking-principal-vault.json")?;
    let stake_reward_vault = ensure_keypair(&out_dir, "social-staking-reward-vault.json")?;
    let monetization_treasury = ensure_keypair(&out_dir, "social-monetization-treasury.json")?;

    ensure_program_vault(&client, &payer, &rewards_treasury, &aeko_social_rewards_program::id(), vault_rent, seed_lamports("AEKO_REWARDS_TREASURY_SEED_LAMPORTS")?, "social-rewards-treasury")?;
    ensure_program_vault(&client, &payer, &rewards_vault, &aeko_social_rewards_program::id(), vault_rent, seed_lamports("AEKO_REWARD_VAULT_SEED_LAMPORTS")?, "social-rewards-vault")?;
    ensure_program_vault(&client, &payer, &stake_vault, &aeko_social_staking_program::id(), vault_rent, 0, "social-staking-principal-vault")?;
    ensure_program_vault(&client, &payer, &stake_reward_vault, &aeko_social_staking_program::id(), vault_rent, seed_lamports("AEKO_STAKE_REWARD_VAULT_SEED_LAMPORTS")?, "social-staking-reward-vault")?;
    ensure_program_vault(&client, &payer, &monetization_treasury, &aeko_social_monetization_program::id(), vault_rent, 0, "social-monetization-treasury")?;

    let posts_state = ensure_keypair(&out_dir, "social-posts-state.json")?;
    let rewards_state = ensure_keypair(&out_dir, "social-rewards-state.json")?;
    let staking_state = ensure_keypair(&out_dir, "social-staking-state.json")?;
    let anti_spam_state = ensure_keypair(&out_dir, "social-anti-spam-state.json")?;
    let monetization_state = ensure_keypair(&out_dir, "social-monetization-state.json")?;

    let posts_data = aeko_social_posts_program::state::SocialPostsStateAccount::new(aeko_social_posts_program::state::SocialPostsConfig {
        authority: authority.pubkey(), posting_enabled: true, engagement_enabled: true, max_content_uri_len: 512,
    });
    create_and_init(&client, &payer, &authority, &posts_state, &aeko_social_posts_program::id(), state_rent,
        aeko_social_posts_program::instruction::initialize_state(&aeko_social_posts_program::id(), &posts_state.pubkey(), &payer.pubkey(), &authority.pubkey(), posts_data),
        "social-posts", posts_state_initialized, registry_preexisted, allow_missing_state)?;

    let rewards_data = aeko_social_rewards_program::state::SocialRewardsStateAccount::new(aeko_social_rewards_program::state::RewardConfig {
        authority: authority.pubkey(),
        treasury: rewards_treasury.pubkey(),
        reward_vault: rewards_vault.pubkey(),
        settlement_authority: authority.pubkey(),
        min_claim_amount: 0,
        rewards_enabled: true,
    });
    create_and_init(&client, &payer, &authority, &rewards_state, &aeko_social_rewards_program::id(), state_rent,
        aeko_social_rewards_program::instruction::initialize_config(&aeko_social_rewards_program::id(), &rewards_state.pubkey(), &payer.pubkey(), &authority.pubkey(), rewards_data),
        "social-rewards", rewards_state_initialized, registry_preexisted, allow_missing_state)?;

    let staking_data = aeko_social_staking_program::state::SocialStakingStateAccount::new(aeko_social_staking_program::state::SocialStakeConfig {
        authority: authority.pubkey(),
        stake_vault: stake_vault.pubkey(),
        reward_vault: stake_reward_vault.pubkey(),
        min_stake_amount: 0,
        cooldown_epochs: 7,
        staking_enabled: true,
    });
    create_and_init(&client, &payer, &authority, &staking_state, &aeko_social_staking_program::id(), state_rent,
        aeko_social_staking_program::instruction::initialize_config(&aeko_social_staking_program::id(), &staking_state.pubkey(), &payer.pubkey(), &authority.pubkey(), staking_data),
        "social-staking", staking_state_initialized, registry_preexisted, allow_missing_state)?;

    let anti_spam_data = aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount::new(aeko_social_anti_spam_program::state::AntiSpamConfig {
        authority: authority.pubkey(),
        mode: aeko_social_anti_spam_program::state::AntiSpamMode::ObserveOnly,
        min_post_stake: 0,
        min_post_reputation: 0,
        cooldown_epochs: 1,
        slash_bps: 0,
    });
    create_and_init(&client, &payer, &authority, &anti_spam_state, &aeko_social_anti_spam_program::id(), state_rent,
        aeko_social_anti_spam_program::instruction::initialize_config(&aeko_social_anti_spam_program::id(), &anti_spam_state.pubkey(), &payer.pubkey(), &authority.pubkey(), anti_spam_data),
        "social-anti-spam", anti_spam_state_initialized, registry_preexisted, allow_missing_state)?;

    let monetization_data = aeko_social_monetization_program::state::SocialMonetizationStateAccount::new(aeko_social_monetization_program::state::MonetizationConfig {
        authority: authority.pubkey(),
        treasury: monetization_treasury.pubkey(),
        platform_fee_bps,
        subscriptions_enabled: true,
        paid_content_enabled: true,
    });
    create_and_init(&client, &payer, &authority, &monetization_state, &aeko_social_monetization_program::id(), state_rent,
        aeko_social_monetization_program::instruction::initialize_config(&aeko_social_monetization_program::id(), &monetization_state.pubkey(), &payer.pubkey(), &authority.pubkey(), monetization_data),
        "social-monetization", monetization_state_initialized, registry_preexisted, allow_missing_state)?;

    // Always run the idempotent migrations. Fresh state already has these values;
    // existing PR-26 state is upgraded without recreating its feed/economic records.
    submit_authority_instruction(&client, &payer, &authority,
        aeko_social_rewards_program::instruction::update_vaults(&aeko_social_rewards_program::id(), &rewards_state.pubkey(), &authority.pubkey(), &rewards_treasury.pubkey(), &rewards_vault.pubkey()),
        "migrate social-rewards vaults")?;
    submit_authority_instruction(&client, &payer, &authority,
        aeko_social_staking_program::instruction::update_vaults(&aeko_social_staking_program::id(), &staking_state.pubkey(), &authority.pubkey(), &stake_vault.pubkey(), &stake_reward_vault.pubkey()),
        "migrate social-staking vaults")?;
    submit_authority_instruction(&client, &payer, &authority,
        aeko_social_monetization_program::instruction::update_treasury(&aeko_social_monetization_program::id(), &monetization_state.pubkey(), &authority.pubkey(), &monetization_treasury.pubkey()),
        "migrate social-monetization treasury")?;

    let registry = format!(
        "# Generated by aeko-social-bootstrap. Do not edit by hand.\n\
AEKO_SOCIAL_POSTS_STATE={}\n\
AEKO_SOCIAL_REWARDS_STATE={}\n\
AEKO_REWARDS_TREASURY_ACCOUNT={}\n\
AEKO_REWARD_VAULT_ACCOUNT={}\n\
AEKO_SOCIAL_STAKING_STATE={}\n\
AEKO_STAKE_VAULT_ACCOUNT={}\n\
AEKO_STAKE_REWARD_VAULT_ACCOUNT={}\n\
AEKO_SOCIAL_ANTI_SPAM_STATE={}\n\
AEKO_SOCIAL_MONETIZATION_STATE={}\n\
AEKO_TREASURY_ADDRESS={}\n\
AEKO_PLATFORM_FEE_BPS={}\n",
        posts_state.pubkey(), rewards_state.pubkey(), rewards_treasury.pubkey(), rewards_vault.pubkey(),
        staking_state.pubkey(), stake_vault.pubkey(), stake_reward_vault.pubkey(), anti_spam_state.pubkey(),
        monetization_state.pubkey(), monetization_treasury.pubkey(), platform_fee_bps,
    );
    write_registry_file(&out_dir, &registry)?;
    println!("# Canonical Explorer/AEKO Social registry:");
    print!("{registry}");
    Ok(())
}

fn ensure_program_vault(client: &RpcClient, payer: &Keypair, vault: &Keypair, owner: &Pubkey, rent: u64, desired_seed: u64, label: &str) -> Result<()> {
    let pubkey = vault.pubkey();
    match with_retries(&format!("{label}:getAccount"), || client.get_account_with_commitment(&pubkey, CommitmentConfig::confirmed()).map_err(anyhow::Error::from))?.value {
        Some(account) => {
            if account.owner != *owner { return Err(anyhow!("[{label}] vault {pubkey} owner {} does not match {owner}", account.owner)); }
            if !account.data.is_empty() { return Err(anyhow!("[{label}] vault {pubkey} must have zero data")); }
            if account.lamports < rent.saturating_add(desired_seed) {
                let top_up = rent.saturating_add(desired_seed).saturating_sub(account.lamports);
                submit_instruction(client, payer, &[payer], system_instruction::transfer(&payer.pubkey(), &pubkey, top_up), &format!("top up {label}"))?;
            }
            return Ok(());
        }
        None => {}
    }
    let lamports = rent.saturating_add(desired_seed);
    submit_instruction(client, payer, &[payer, vault], system_instruction::create_account(&payer.pubkey(), &pubkey, lamports, 0, owner), &format!("create {label}"))
}

fn submit_authority_instruction(client: &RpcClient, payer: &Keypair, authority: &Keypair, instruction: Instruction, label: &str) -> Result<()> {
    submit_instruction(client, payer, &[payer, authority], instruction, label)
}

fn submit_instruction(client: &RpcClient, payer: &Keypair, signers: &[&Keypair], instruction: Instruction, label: &str) -> Result<()> {
    let mut last_error = None;
    for attempt in 1..=SEND_MAX_ATTEMPTS {
        let blockhash = match client.get_latest_blockhash() {
            Ok(value) => value,
            Err(error) => { last_error = Some(anyhow!("{label}: getLatestBlockhash failed: {error}")); sleep_backoff(attempt); continue; }
        };
        let tx = Transaction::new_signed_with_payer(&[instruction.clone()], Some(&payer.pubkey()), signers, blockhash);
        match client.send_and_confirm_transaction(&tx) {
            Ok(signature) => { eprintln!("[{label}] confirmed {signature}"); return Ok(()); }
            Err(error) => { last_error = Some(anyhow!("[{label}] attempt {attempt} failed: {error}")); sleep_backoff(attempt); }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow!("[{label}] exhausted retries")))
}

#[allow(clippy::too_many_arguments)]
fn create_and_init(client: &RpcClient, payer: &Keypair, authority: &Keypair, state: &Keypair, program_id: &Pubkey, rent: u64, init_ix: Instruction, label: &str, state_initialized: fn(&[u8]) -> Result<bool>, registry_preexisted: bool, allow_missing_state: bool) -> Result<()> {
    let state_pubkey = state.pubkey();
    if existing_state_is_initialized(client, &state_pubkey, program_id, label, state_initialized)? { eprintln!("[{label}] existing initialized state verified"); return Ok(()); }
    if registry_preexisted && !allow_missing_state {
        return Err(anyhow!("[{label}] state {state_pubkey} is missing while {REGISTRY_FILE_NAME} exists; set AEKO_BOOTSTRAP_ALLOW_MISSING_STATE=1 only for intentional recovery"));
    }
    let instructions = vec![system_instruction::create_account(&payer.pubkey(), &state_pubkey, rent, STATE_ACCOUNT_SPACE, program_id), init_ix];
    let signers: Vec<&Keypair> = vec![payer, authority, state];
    let mut last_error = None;
    for attempt in 1..=SEND_MAX_ATTEMPTS {
        let blockhash = match client.get_latest_blockhash() { Ok(value) => value, Err(error) => { last_error = Some(anyhow!("getLatestBlockhash failed: {error}")); sleep_backoff(attempt); continue; } };
        let tx = Transaction::new_signed_with_payer(&instructions, Some(&payer.pubkey()), &signers, blockhash);
        match client.send_and_confirm_transaction(&tx) {
            Ok(signature) => { eprintln!("[{label}] init confirmed {signature}"); return Ok(()); }
            Err(error) => {
                if existing_state_is_initialized(client, &state_pubkey, program_id, label, state_initialized).unwrap_or(false) { return Ok(()); }
                last_error = Some(anyhow!("[{label}] init failed: {error}")); sleep_backoff(attempt);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow!("[{label}] exhausted retries")))
}

fn existing_state_is_initialized(client: &RpcClient, state_pubkey: &Pubkey, program_id: &Pubkey, label: &str, state_initialized: fn(&[u8]) -> Result<bool>) -> Result<bool> {
    let response = with_retries(&format!("{label}:getAccount"), || client.get_account_with_commitment(state_pubkey, CommitmentConfig::confirmed()).map_err(anyhow::Error::from))?;
    match response.value {
        None => Ok(false),
        Some(account) if account.owner != *program_id => Err(anyhow!("[{label}] state {state_pubkey} owner {} does not match {program_id}", account.owner)),
        Some(account) if state_initialized(&account.data)? => Ok(true),
        Some(_) => Err(anyhow!("[{label}] state {state_pubkey} exists but is not initialized")),
    }
}

fn posts_state_initialized(data: &[u8]) -> Result<bool> { Ok(aeko_social_posts_program::state::SocialPostsStateAccount::deserialize_padded(data).map_err(|_| anyhow!("invalid social-posts state"))?.is_initialized) }
fn rewards_state_initialized(data: &[u8]) -> Result<bool> { Ok(aeko_social_rewards_program::state::SocialRewardsStateAccount::deserialize_padded(data).map_err(|_| anyhow!("invalid social-rewards state"))?.is_initialized) }
fn staking_state_initialized(data: &[u8]) -> Result<bool> { Ok(aeko_social_staking_program::state::SocialStakingStateAccount::deserialize_padded(data).map_err(|_| anyhow!("invalid social-staking state"))?.is_initialized) }
fn anti_spam_state_initialized(data: &[u8]) -> Result<bool> { Ok(aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount::deserialize_padded(data).map_err(|_| anyhow!("invalid social-anti-spam state"))?.is_initialized) }
fn monetization_state_initialized(data: &[u8]) -> Result<bool> { Ok(aeko_social_monetization_program::state::SocialMonetizationStateAccount::deserialize_padded(data).map_err(|_| anyhow!("invalid social-monetization state"))?.is_initialized) }

fn ensure_keypair(out_dir: &Path, file_name: &str) -> Result<Keypair> {
    let path = out_dir.join(file_name);
    if path.exists() { read_keypair_file(&path).map_err(|error| anyhow!("failed to read {}: {error}", path.display())) }
    else { let keypair = Keypair::new(); write_keypair_file(&keypair, &path).map_err(|error| anyhow!("failed to write {}: {error}", path.display()))?; Ok(keypair) }
}

fn seed_lamports(name: &str) -> Result<u64> {
    env::var(name).unwrap_or_else(|_| "0".to_string()).parse::<u64>().with_context(|| format!("{name} must be a non-negative lamport amount"))
}

fn parse_bool_flag(name: &str) -> Result<bool> {
    match env::var(name) {
        Ok(value) => match value.trim().to_ascii_lowercase().as_str() { "" | "0" | "false" | "no" | "off" => Ok(false), "1" | "true" | "yes" | "on" => Ok(true), _ => Err(anyhow!("{name} must be boolean")) },
        Err(env::VarError::NotPresent) => Ok(false),
        Err(error) => Err(anyhow!("failed to read {name}: {error}")),
    }
}

fn parse_platform_fee_bps() -> Result<u16> {
    let value = env::var("AEKO_PLATFORM_FEE_BPS").unwrap_or_else(|_| "200".to_string());
    let fee = value.parse::<u16>().with_context(|| format!("AEKO_PLATFORM_FEE_BPS={value:?} is not a u16"))?;
    if fee > 10_000 { return Err(anyhow!("AEKO_PLATFORM_FEE_BPS must be <= 10000")); }
    Ok(fee)
}

fn write_registry_file(out_dir: &Path, contents: &str) -> Result<()> {
    let target = out_dir.join(REGISTRY_FILE_NAME);
    let temp = out_dir.join(format!("{REGISTRY_FILE_NAME}.tmp"));
    fs::write(&temp, contents).with_context(|| format!("writing {}", temp.display()))?;
    fs::rename(&temp, &target).with_context(|| format!("publishing {}", target.display()))?;
    Ok(())
}

fn wait_for_rpc_ready(client: &RpcClient) -> Result<()> {
    let start = Instant::now();
    loop {
        match client.get_slot() {
            Ok(slot) if slot >= RPC_READY_MIN_SLOT => { eprintln!("rpc ready at slot {slot}"); return Ok(()); }
            _ if start.elapsed() > RPC_READY_TIMEOUT => return Err(anyhow!("RPC did not become ready within {RPC_READY_TIMEOUT:?}")),
            _ => thread::sleep(RPC_READY_POLL_INTERVAL),
        }
    }
}

fn with_retries<T, F: FnMut() -> Result<T>>(label: &str, mut operation: F) -> Result<T> {
    let mut last_error = None;
    for attempt in 1..=SEND_MAX_ATTEMPTS {
        match operation() { Ok(value) => return Ok(value), Err(error) => { eprintln!("[{label}] attempt {attempt}/{SEND_MAX_ATTEMPTS}: {error}"); last_error = Some(error); sleep_backoff(attempt); } }
    }
    Err(last_error.unwrap_or_else(|| anyhow!("[{label}] exhausted retries")))
}

fn sleep_backoff(attempt: u32) {
    let backoff = SEND_BASE_BACKOFF.checked_mul(1u32 << attempt.min(4)).unwrap_or(SEND_MAX_BACKOFF).min(SEND_MAX_BACKOFF);
    thread::sleep(backoff);
}
