//! Bootstraps the on-chain state accounts for the AEKO SocialFi native
//! builtins: social-posts, social-rewards, social-staking, social-anti-spam,
//! and social-monetization.
//!
//! Each program is a native builtin (registered in `runtime/src/builtins.rs`),
//! so its program ID is recognized by the SVM with no BPF deploy step. What
//! each program still needs before it is usable is a state account owned by
//! that program. This binary creates those accounts once, initializes them,
//! persists their keypairs, and publishes a canonical registry file consumed
//! by the Explorer API.
//!
//! Re-running is intentionally safe. If a persisted state keypair resolves to
//! an existing program-owned account that fully decodes as that program's state
//! and is initialized, the bootstrap skips it without sending Initialize again.
//! Existing accounts with an unexpected owner or an uninitialized state are
//! rejected rather than overwritten.

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
    borsh::BorshSerialize,
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

const STATE_ACCOUNT_SPACE: u64 = 64 * 1024;
const REGISTRY_FILE_NAME: &str = "social-registry.env";

fn main() -> Result<()> {
    let rpc_url =
        env::var("AEKO_RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string());
    let payer_path = env::var("AEKO_PAYER_KEYPAIR")
        .context("AEKO_PAYER_KEYPAIR must point at a funded keypair file")?;
    let payer = read_keypair_file(&payer_path)
        .map_err(|e| anyhow!("failed to read payer keypair at {payer_path}: {e}"))?;

    let authority: Keypair = match env::var("AEKO_AUTHORITY_KEYPAIR") {
        Ok(path) if !path.trim().is_empty() => read_keypair_file(path.trim())
            .map_err(|e| anyhow!("failed to read authority keypair at {path}: {e}"))?,
        _ => Keypair::from_bytes(&payer.to_bytes())
            .expect("payer bytes round-trip into authority keypair"),
    };
    let treasury = parse_optional_pubkey("AEKO_TREASURY_ADDRESS")?
        .unwrap_or_else(|| authority.pubkey());
    let reward_vault =
        parse_optional_pubkey("AEKO_REWARD_VAULT")?.unwrap_or_else(|| authority.pubkey());
    let stake_vault =
        parse_optional_pubkey("AEKO_STAKE_VAULT")?.unwrap_or_else(|| authority.pubkey());
    let platform_fee_bps = parse_platform_fee_bps()?;

    let out_dir = PathBuf::from(
        env::var("AEKO_BOOTSTRAP_OUT_DIR")
            .unwrap_or_else(|_| "./local-testnet/social-state".to_string()),
    );
    fs::create_dir_all(&out_dir).context("creating state-keypair output directory")?;
    let registry_preexisted = out_dir.join(REGISTRY_FILE_NAME).is_file();
    let allow_missing_state = parse_bool_flag("AEKO_BOOTSTRAP_ALLOW_MISSING_STATE")?;

    let client = RpcClient::new_with_commitment(rpc_url.clone(), CommitmentConfig::confirmed());

    eprintln!("==> aeko-social-bootstrap");
    eprintln!("    rpc:       {rpc_url}");
    eprintln!("    payer:     {}", payer.pubkey());
    eprintln!("    authority: {}", authority.pubkey());
    eprintln!("    treasury:  {treasury}");
    eprintln!("    out-dir:   {}", out_dir.display());
    eprintln!(
        "    recovery:  registry_preexisted={registry_preexisted} allow_missing_state={allow_missing_state}"
    );
    eprintln!();

    wait_for_rpc_ready(&client)?;

    let rent = with_retries("getMinimumBalanceForRentExemption", || {
        client
            .get_minimum_balance_for_rent_exemption(STATE_ACCOUNT_SPACE as usize)
            .map_err(anyhow::Error::from)
    })?;

    // ---- social-posts ----
    let posts_state = ensure_keypair(&out_dir, "social-posts-state.json")?;
    let posts_init_data = aeko_social_posts_program::state::SocialPostsStateAccount::new(
        aeko_social_posts_program::state::SocialPostsConfig {
            authority: authority.pubkey(),
            posting_enabled: true,
            engagement_enabled: true,
            max_content_uri_len: 512,
        },
    );
    let posts_ix = aeko_social_posts_program::instruction::initialize_state(
        &aeko_social_posts_program::id(),
        &posts_state.pubkey(),
        &payer.pubkey(),
        &authority.pubkey(),
        posts_init_data,
    );
    create_and_init(
        &client,
        &payer,
        &authority,
        &posts_state,
        &aeko_social_posts_program::id(),
        rent,
        posts_ix,
        "social-posts",
        posts_state_initialized,
        registry_preexisted,
        allow_missing_state,
    )?;

    // ---- social-rewards ----
    let rewards_state = ensure_keypair(&out_dir, "social-rewards-state.json")?;
    let rewards_init_data = aeko_social_rewards_program::state::SocialRewardsStateAccount::new(
        aeko_social_rewards_program::state::RewardConfig {
            authority: authority.pubkey(),
            treasury,
            reward_vault,
            settlement_authority: authority.pubkey(),
            min_claim_amount: 0,
            rewards_enabled: true,
        },
    );
    let rewards_ix = aeko_social_rewards_program::instruction::initialize_config(
        &aeko_social_rewards_program::id(),
        &rewards_state.pubkey(),
        &payer.pubkey(),
        &authority.pubkey(),
        rewards_init_data,
    );
    create_and_init(
        &client,
        &payer,
        &authority,
        &rewards_state,
        &aeko_social_rewards_program::id(),
        rent,
        rewards_ix,
        "social-rewards",
        rewards_state_initialized,
        registry_preexisted,
        allow_missing_state,
    )?;

    // ---- social-staking ----
    let staking_state = ensure_keypair(&out_dir, "social-staking-state.json")?;
    let staking_init_data = aeko_social_staking_program::state::SocialStakingStateAccount::new(
        aeko_social_staking_program::state::SocialStakeConfig {
            authority: authority.pubkey(),
            stake_vault,
            reward_vault,
            min_stake_amount: 0,
            cooldown_epochs: 7,
            staking_enabled: true,
        },
    );
    let staking_ix = aeko_social_staking_program::instruction::initialize_config(
        &aeko_social_staking_program::id(),
        &staking_state.pubkey(),
        &payer.pubkey(),
        &authority.pubkey(),
        staking_init_data,
    );
    create_and_init(
        &client,
        &payer,
        &authority,
        &staking_state,
        &aeko_social_staking_program::id(),
        rent,
        staking_ix,
        "social-staking",
        staking_state_initialized,
        registry_preexisted,
        allow_missing_state,
    )?;

    // ---- social-anti-spam ----
    let anti_spam_state = ensure_keypair(&out_dir, "social-anti-spam-state.json")?;
    let anti_spam_init_data =
        aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount::new(
            aeko_social_anti_spam_program::state::AntiSpamConfig {
                authority: authority.pubkey(),
                mode: aeko_social_anti_spam_program::state::AntiSpamMode::ObserveOnly,
                min_post_stake: 0,
                min_post_reputation: 0,
                cooldown_epochs: 1,
                slash_bps: 0,
            },
        );
    let anti_spam_ix = aeko_social_anti_spam_program::instruction::initialize_config(
        &aeko_social_anti_spam_program::id(),
        &anti_spam_state.pubkey(),
        &payer.pubkey(),
        &authority.pubkey(),
        anti_spam_init_data,
    );
    create_and_init(
        &client,
        &payer,
        &authority,
        &anti_spam_state,
        &aeko_social_anti_spam_program::id(),
        rent,
        anti_spam_ix,
        "social-anti-spam",
        anti_spam_state_initialized,
        registry_preexisted,
        allow_missing_state,
    )?;

    // ---- social-monetization ----
    let monet_state = ensure_keypair(&out_dir, "social-monetization-state.json")?;
    let monet_init_data =
        aeko_social_monetization_program::state::SocialMonetizationStateAccount::new(
            aeko_social_monetization_program::state::MonetizationConfig {
                authority: authority.pubkey(),
                treasury,
                platform_fee_bps,
                subscriptions_enabled: true,
                paid_content_enabled: true,
            },
        );
    let monet_ix = aeko_social_monetization_program::instruction::initialize_config(
        &aeko_social_monetization_program::id(),
        &monet_state.pubkey(),
        &payer.pubkey(),
        &authority.pubkey(),
        monet_init_data,
    );
    create_and_init(
        &client,
        &payer,
        &authority,
        &monet_state,
        &aeko_social_monetization_program::id(),
        rent,
        monet_ix,
        "social-monetization",
        monetization_state_initialized,
        registry_preexisted,
        allow_missing_state,
    )?;

    let registry = format!(
        "# Generated by aeko-social-bootstrap. Do not edit by hand.\n\
AEKO_SOCIAL_POSTS_STATE={}\n\
AEKO_SOCIAL_REWARDS_STATE={}\n\
AEKO_REWARD_VAULT_ACCOUNT={reward_vault}\n\
AEKO_SOCIAL_STAKING_STATE={}\n\
AEKO_SOCIAL_ANTI_SPAM_STATE={}\n\
AEKO_SOCIAL_MONETIZATION_STATE={}\n\
AEKO_TREASURY_ADDRESS={treasury}\n\
AEKO_PLATFORM_FEE_BPS={platform_fee_bps}\n",
        posts_state.pubkey(),
        rewards_state.pubkey(),
        staking_state.pubkey(),
        anti_spam_state.pubkey(),
        monet_state.pubkey(),
    );
    write_registry_file(&out_dir, &registry)?;

    println!();
    println!("# Canonical Explorer/Aeko backend SocialFi registry:");
    print!("{registry}");
    println!("# Compatibility aliases for older integrations:");
    println!("SOCIAL_POSTS_STATE_ACCOUNT={}", posts_state.pubkey());
    println!("SOCIAL_REWARDS_STATE_ACCOUNT={}", rewards_state.pubkey());
    println!("REWARD_VAULT_ACCOUNT={reward_vault}");
    println!("SOCIAL_STAKING_STATE_ACCOUNT={}", staking_state.pubkey());
    println!("STAKING_COOLDOWN_EPOCHS=7");
    println!("SOCIAL_ANTI_SPAM_STATE_ACCOUNT={}", anti_spam_state.pubkey());
    println!("SOCIAL_MONETIZATION_STATE_ACCOUNT={}", monet_state.pubkey());

    Ok(())
}

fn parse_optional_pubkey(env_name: &str) -> Result<Option<Pubkey>> {
    match env::var(env_name) {
        Ok(value) if !value.trim().is_empty() => Pubkey::from_str(value.trim())
            .map(Some)
            .map_err(|e| anyhow!("{env_name} is not a valid pubkey: {e}")),
        _ => Ok(None),
    }
}

fn parse_bool_flag(env_name: &str) -> Result<bool> {
    match env::var(env_name) {
        Ok(value) => match value.trim().to_ascii_lowercase().as_str() {
            "" | "0" | "false" | "no" | "off" => Ok(false),
            "1" | "true" | "yes" | "on" => Ok(true),
            _ => Err(anyhow!(
                "{env_name} must be one of 0/1, false/true, no/yes, or off/on"
            )),
        },
        Err(env::VarError::NotPresent) => Ok(false),
        Err(error) => Err(anyhow!("failed to read {env_name}: {error}")),
    }
}

fn parse_platform_fee_bps() -> Result<u16> {
    let value = env::var("AEKO_PLATFORM_FEE_BPS").unwrap_or_else(|_| "200".to_string());
    let fee = value
        .trim()
        .parse::<u16>()
        .with_context(|| format!("AEKO_PLATFORM_FEE_BPS={value:?} is not a valid u16"))?;
    if fee > 10_000 {
        return Err(anyhow!(
            "AEKO_PLATFORM_FEE_BPS must be between 0 and 10000, got {fee}"
        ));
    }
    Ok(fee)
}

fn ensure_keypair(out_dir: &Path, file_name: &str) -> Result<Keypair> {
    let path = out_dir.join(file_name);
    if path.exists() {
        read_keypair_file(&path)
            .map_err(|e| anyhow!("failed to read existing state keypair {}: {e}", path.display()))
    } else {
        let kp = Keypair::new();
        write_keypair_file(&kp, &path)
            .map_err(|e| anyhow!("failed to write state keypair {}: {e}", path.display()))?;
        Ok(kp)
    }
}

fn decode_state<T, E>(
    data: &[u8],
    label: &str,
    decode: impl FnOnce(&[u8]) -> std::result::Result<T, E>,
    initialized: impl FnOnce(&T) -> bool,
) -> Result<bool>
where
    E: std::fmt::Debug,
{
    let state = decode(data)
        .map_err(|error| anyhow!("[{label}] existing state account is not valid program state: {error:?}"))?;
    Ok(initialized(&state))
}

fn posts_state_initialized(data: &[u8]) -> Result<bool> {
    decode_state(
        data,
        "social-posts",
        aeko_social_posts_program::state::SocialPostsStateAccount::deserialize_padded,
        |state| state.is_initialized,
    )
}

fn rewards_state_initialized(data: &[u8]) -> Result<bool> {
    decode_state(
        data,
        "social-rewards",
        aeko_social_rewards_program::state::SocialRewardsStateAccount::deserialize_padded,
        |state| state.is_initialized,
    )
}

fn staking_state_initialized(data: &[u8]) -> Result<bool> {
    decode_state(
        data,
        "social-staking",
        aeko_social_staking_program::state::SocialStakingStateAccount::deserialize_padded,
        |state| state.is_initialized,
    )
}

fn anti_spam_state_initialized(data: &[u8]) -> Result<bool> {
    decode_state(
        data,
        "social-anti-spam",
        aeko_social_anti_spam_program::state::SocialAntiSpamStateAccount::deserialize_padded,
        |state| state.is_initialized,
    )
}

fn monetization_state_initialized(data: &[u8]) -> Result<bool> {
    decode_state(
        data,
        "social-monetization",
        aeko_social_monetization_program::state::SocialMonetizationStateAccount::deserialize_padded,
        |state| state.is_initialized,
    )
}

fn existing_state_is_initialized(
    client: &RpcClient,
    state_pubkey: &Pubkey,
    program_id: &Pubkey,
    label: &str,
    state_initialized: fn(&[u8]) -> Result<bool>,
) -> Result<bool> {
    let response = with_retries(&format!("{label}:getAccount"), || {
        client
            .get_account_with_commitment(state_pubkey, CommitmentConfig::confirmed())
            .with_context(|| format!("[{label}] failed to read state account {state_pubkey}"))
    })?;

    match response.value {
        None => Ok(false),
        Some(account) if account.owner != *program_id => Err(anyhow!(
            "[{label}] state account {state_pubkey} is owned by {}, expected {program_id}; refusing to overwrite",
            account.owner
        )),
        Some(account) => {
            if state_initialized(&account.data)? {
                Ok(true)
            } else {
                Err(anyhow!(
                    "[{label}] state account {state_pubkey} is program-owned but is not initialized; refusing to overwrite"
                ))
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn create_and_init(
    client: &RpcClient,
    payer: &Keypair,
    authority: &Keypair,
    state: &Keypair,
    program_id: &Pubkey,
    rent: u64,
    init_ix: Instruction,
    label: &str,
    state_initialized: fn(&[u8]) -> Result<bool>,
    registry_preexisted: bool,
    allow_missing_state: bool,
) -> Result<()> {
    let state_pubkey = state.pubkey();
    eprintln!("[{label}] state pubkey: {state_pubkey}");

    if existing_state_is_initialized(client, &state_pubkey, program_id, label, state_initialized)? {
        eprintln!("[{label}] existing initialized state verified; skipping initialization.");
        return Ok(());
    }

    if registry_preexisted && !allow_missing_state {
        return Err(anyhow!(
            "[{label}] state account {state_pubkey} is missing even though {REGISTRY_FILE_NAME} already exists; refusing to recreate protocol state on an established chain. Set AEKO_BOOTSTRAP_ALLOW_MISSING_STATE=1 only for an intentional fresh-genesis recovery."
        ));
    }

    let instructions = vec![
        system_instruction::create_account(
            &payer.pubkey(),
            &state_pubkey,
            rent,
            STATE_ACCOUNT_SPACE,
            program_id,
        ),
        init_ix,
    ];
    let signers: Vec<&Keypair> = vec![payer, authority, state];

    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 1..=SEND_MAX_ATTEMPTS {
        let recent_blockhash = match client.get_latest_blockhash() {
            Ok(bh) => bh,
            Err(e) => {
                last_err = Some(anyhow!("getLatestBlockhash failed: {e}"));
                sleep_backoff(attempt);
                continue;
            }
        };
        let tx = Transaction::new_signed_with_payer(
            &instructions,
            Some(&payer.pubkey()),
            &signers,
            recent_blockhash,
        );
        match client.send_and_confirm_transaction(&tx) {
            Ok(sig) => {
                eprintln!("[{label}] init confirmed: {sig} (attempt {attempt})");
                return Ok(());
            }
            Err(e) => {
                match existing_state_is_initialized(client, &state_pubkey, program_id, label, state_initialized) {
                    Ok(true) => {
                        eprintln!(
                            "[{label}] state became initialized during submit; treating retry race as success."
                        );
                        return Ok(());
                    }
                    Ok(false) => {}
                    Err(state_error) => return Err(state_error),
                }
                eprintln!("[{label}] init attempt {attempt}/{SEND_MAX_ATTEMPTS} failed: {e}");
                last_err = Some(anyhow!("[{label}] init failed: {e}"));
                sleep_backoff(attempt);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("[{label}] init exhausted retries")))
}

fn write_registry_file(out_dir: &Path, contents: &str) -> Result<()> {
    let target = out_dir.join(REGISTRY_FILE_NAME);
    let temp = out_dir.join(format!("{REGISTRY_FILE_NAME}.tmp"));
    fs::write(&temp, contents)
        .with_context(|| format!("writing temporary SocialFi registry {}", temp.display()))?;
    fs::rename(&temp, &target)
        .with_context(|| format!("publishing SocialFi registry {}", target.display()))?;
    eprintln!("==> wrote SocialFi registry: {}", target.display());
    Ok(())
}

fn wait_for_rpc_ready(client: &RpcClient) -> Result<()> {
    let start = Instant::now();
    let mut last_log = Instant::now() - Duration::from_secs(10);
    eprintln!("==> waiting for RPC readiness (slot >= {RPC_READY_MIN_SLOT})…");
    loop {
        match client.get_slot() {
            Ok(slot) if slot >= RPC_READY_MIN_SLOT => {
                eprintln!("    rpc ready at slot {slot}");
                return Ok(());
            }
            Ok(slot) => {
                if last_log.elapsed() >= Duration::from_secs(5) {
                    eprintln!("    rpc up, slot={slot} (waiting for >= {RPC_READY_MIN_SLOT})");
                    last_log = Instant::now();
                }
            }
            Err(e) => {
                if last_log.elapsed() >= Duration::from_secs(5) {
                    eprintln!("    rpc not ready yet: {e}");
                    last_log = Instant::now();
                }
            }
        }
        if start.elapsed() > RPC_READY_TIMEOUT {
            return Err(anyhow!(
                "RPC did not become ready within {:?}",
                RPC_READY_TIMEOUT
            ));
        }
        thread::sleep(RPC_READY_POLL_INTERVAL);
    }
}

fn with_retries<T, F: FnMut() -> Result<T>>(label: &str, mut f: F) -> Result<T> {
    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 1..=SEND_MAX_ATTEMPTS {
        match f() {
            Ok(v) => {
                if attempt > 1 {
                    eprintln!("[{label}] succeeded on attempt {attempt}");
                }
                return Ok(v);
            }
            Err(e) => {
                eprintln!("[{label}] attempt {attempt}/{SEND_MAX_ATTEMPTS} failed: {e}");
                last_err = Some(e);
                sleep_backoff(attempt);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("[{label}] exhausted retries")))
}

fn sleep_backoff(attempt: u32) {
    let backoff = SEND_BASE_BACKOFF
        .checked_mul(1u32 << attempt.min(4))
        .unwrap_or(SEND_MAX_BACKOFF)
        .min(SEND_MAX_BACKOFF);
    thread::sleep(backoff);
}

#[allow(dead_code)]
fn assert_state_fits(serialized: &[u8]) {
    debug_assert!(
        serialized.len() as u64 <= STATE_ACCOUNT_SPACE,
        "serialized state exceeds STATE_ACCOUNT_SPACE — bump the constant"
    );
}

#[allow(dead_code)]
fn serialized_len<T: BorshSerialize>(value: &T) -> usize {
    borsh::to_vec(value).map(|v| v.len()).unwrap_or(0)
}
