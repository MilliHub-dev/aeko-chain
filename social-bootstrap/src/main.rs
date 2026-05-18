//! Bootstraps the on-chain state accounts for the AEKO SocialFi native
//! builtins: social-posts, social-rewards, social-staking, social-anti-spam,
//! and social-monetization.
//!
//! Each program is a native builtin (registered in `runtime/src/builtins.rs`),
//! so its program ID is recognized by the SVM with no BPF deploy step. What
//! each program still needs before it's usable is a **state account**:
//! an account owned by the program holding its global config and accumulators.
//! This binary creates each state account and sends the matching
//! `InitializeState` / `InitializeConfig` instruction, then prints the
//! resulting pubkeys so the operator can paste them into a dApp backend's
//! env file.
//!
//! Inputs (env vars):
//!   - `AEKO_RPC_URL`         JSON-RPC endpoint to send transactions to.
//!                            Default: http://localhost:8899
//!   - `AEKO_PAYER_KEYPAIR`   Path to a JSON keypair file with enough AEKO
//!                            to fund rent for five accounts. Required.
//!   - `AEKO_AUTHORITY_KEYPAIR` Optional. Authority that ends up owning each
//!                            config — defaults to the payer.
//!   - `AEKO_TREASURY_ADDRESS`  Optional. Pubkey for treasury fields in
//!                            rewards + monetization. Defaults to authority.
//!   - `AEKO_REWARD_VAULT`    Optional. Defaults to authority.
//!   - `AEKO_STAKE_VAULT`     Optional. Defaults to authority.
//!   - `AEKO_BOOTSTRAP_OUT_DIR` Where to write the generated state keypairs.
//!                            Default: ./local-testnet/social-state
//!
//! Re-running is safe: if `<out_dir>/<program>-state.json` already exists,
//! that keypair is reused. The chain-side check then refuses to re-create
//! an already-initialized account, so accidental double-runs don't clobber.

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
        path::PathBuf,
        str::FromStr,
        thread,
        time::{Duration, Instant},
    },
};

// Validator readiness + send retry tuning. Production deploys can race the
// validator: `getHealth` flips to ok while the bank is still finalizing its
// first few slots, so the first `sendTransaction` can come back with
// BlockhashNotFound, FetchHttp, or AccountInUse. Rather than rely on the
// docker `restart: on-failure` loop (which costs a fresh process per attempt
// and looks like a crash in Coolify), we sit in-process and back off.
const RPC_READY_TIMEOUT: Duration = Duration::from_secs(180);
const RPC_READY_POLL_INTERVAL: Duration = Duration::from_secs(2);
const RPC_READY_MIN_SLOT: u64 = 4;

const SEND_MAX_ATTEMPTS: u32 = 12;
const SEND_BASE_BACKOFF: Duration = Duration::from_millis(750);
const SEND_MAX_BACKOFF: Duration = Duration::from_secs(8);

// Per-state-account allocation. The actual serialized state with empty Vec<>s
// is ~80–200 bytes; we pre-allocate 64 KB so dApps have headroom to append
// posts/positions/profiles before needing a realloc.
const STATE_ACCOUNT_SPACE: u64 = 64 * 1024;

fn main() -> Result<()> {
    let rpc_url =
        env::var("AEKO_RPC_URL").unwrap_or_else(|_| "http://localhost:8899".to_string());
    let payer_path = env::var("AEKO_PAYER_KEYPAIR")
        .context("AEKO_PAYER_KEYPAIR must point at a funded keypair file")?;
    let payer = read_keypair_file(&payer_path)
        .map_err(|e| anyhow!("failed to read payer keypair at {payer_path}: {e}"))?;

    let authority: Keypair = match env::var("AEKO_AUTHORITY_KEYPAIR") {
        Ok(path) => read_keypair_file(&path)
            .map_err(|e| anyhow!("failed to read authority keypair at {path}: {e}"))?,
        Err(_) => Keypair::from_bytes(&payer.to_bytes())
            .expect("payer bytes round-trip into authority keypair"),
    };
    let treasury = parse_optional_pubkey("AEKO_TREASURY_ADDRESS")?
        .unwrap_or_else(|| authority.pubkey());
    let reward_vault =
        parse_optional_pubkey("AEKO_REWARD_VAULT")?.unwrap_or_else(|| authority.pubkey());
    let stake_vault =
        parse_optional_pubkey("AEKO_STAKE_VAULT")?.unwrap_or_else(|| authority.pubkey());

    let out_dir = PathBuf::from(
        env::var("AEKO_BOOTSTRAP_OUT_DIR")
            .unwrap_or_else(|_| "./local-testnet/social-state".to_string()),
    );
    fs::create_dir_all(&out_dir).context("creating state-keypair output directory")?;

    let client = RpcClient::new_with_commitment(rpc_url.clone(), CommitmentConfig::confirmed());

    eprintln!("==> aeko-social-bootstrap");
    eprintln!("    rpc:       {rpc_url}");
    eprintln!("    payer:     {}", payer.pubkey());
    eprintln!("    authority: {}", authority.pubkey());
    eprintln!("    treasury:  {treasury}");
    eprintln!("    out-dir:   {}", out_dir.display());
    eprintln!();

    // Don't even try to fetch rent / submit txs until the validator is past
    // its first few slots. getHealth flips to ok early; the bank still
    // rejects sends until BlockhashNotFound clears.
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
    )?;

    // ---- social-monetization ----
    let monet_state = ensure_keypair(&out_dir, "social-monetization-state.json")?;
    let monet_init_data =
        aeko_social_monetization_program::state::SocialMonetizationStateAccount::new(
            aeko_social_monetization_program::state::MonetizationConfig {
                authority: authority.pubkey(),
                treasury,
                platform_fee_bps: 200, // 2 %
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
    )?;

    // ---- summary ----
    println!();
    println!("# Paste these into your dApp backend's env file:");
    println!("SOCIAL_POSTS_STATE_ACCOUNT={}", posts_state.pubkey());
    println!("SOCIAL_REWARDS_STATE_ACCOUNT={}", rewards_state.pubkey());
    println!("REWARD_VAULT_ACCOUNT={reward_vault}");
    println!("SOCIAL_STAKING_STATE_ACCOUNT={}", staking_state.pubkey());
    println!("STAKING_COOLDOWN_EPOCHS=7");
    println!("SOCIAL_ANTI_SPAM_STATE_ACCOUNT={}", anti_spam_state.pubkey());
    println!("SOCIAL_MONETIZATION_STATE_ACCOUNT={}", monet_state.pubkey());
    println!("AEKO_TREASURY_ADDRESS={treasury}");
    println!("AEKO_PLATFORM_FEE_BPS=200");

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

fn ensure_keypair(out_dir: &PathBuf, file_name: &str) -> Result<Keypair> {
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
) -> Result<()> {
    eprintln!("[{label}] state pubkey: {}", state.pubkey());

    // If the account already exists and is owned by the program, skip the
    // create_account step. The program's init handler will then reject the
    // double-init with `AlreadyInitialized`; we surface that as a skip.
    let already_owned = client
        .get_account(&state.pubkey())
        .map(|acct| acct.owner == *program_id)
        .unwrap_or(false);

    let mut instructions: Vec<Instruction> = Vec::new();
    if !already_owned {
        instructions.push(system_instruction::create_account(
            &payer.pubkey(),
            &state.pubkey(),
            rent,
            STATE_ACCOUNT_SPACE,
            program_id,
        ));
    }
    instructions.push(init_ix);

    let mut signers: Vec<&Keypair> = vec![payer, authority];
    if !already_owned {
        signers.push(state);
    }

    // Retry the whole {fresh blockhash → sign → submit} cycle. Blockhashes
    // expire quickly on a freshly-started validator, and the first few sends
    // can fail with FetchHttp/BlockhashNotFound while the bank stabilises;
    // a stale blockhash makes the retry equally pointless, so we re-fetch.
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
                let msg = e.to_string();
                if msg.contains("AlreadyInitialized") || msg.contains("already in use") {
                    eprintln!("[{label}] already initialized, skipping.");
                    return Ok(());
                }
                eprintln!("[{label}] init attempt {attempt}/{SEND_MAX_ATTEMPTS} failed: {e}");
                last_err = Some(anyhow!("[{label}] init failed: {e}"));
                sleep_backoff(attempt);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("[{label}] init exhausted retries")))
}

// ---------- readiness + retry helpers ----------

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
    // Exponential backoff capped at SEND_MAX_BACKOFF, e.g. 0.75s, 1.5s, 3s,
    // 6s, 8s, 8s, … Keeps total wall-clock < ~75s across SEND_MAX_ATTEMPTS.
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
