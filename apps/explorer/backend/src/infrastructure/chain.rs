use {
    crate::{
        config::ExplorerBackendConfig,
        infrastructure::rpc_error::RpcRequestError,
        models::{
            AssetSnapshot, BlockRecord, ChainAccountRecord, CoreSlotRecord, NftCollectionRecord,
            NftRecord, TokenAccountRecord, TokenMintRecord, TokenTransferRecord,
            TransactionAccountDetailRecord, TransactionAccountRecord, TransactionDetailRecord,
            TransactionInnerInstructionGroupRecord, TransactionInstructionDetailRecord,
            TransactionRecord, TransactionTokenBalanceChangeRecord,
        },
    },
    aeko_sdk::{hash::Hash, pubkey::Pubkey, signature::Signature},
    aeko_token_20_program::{
        instruction::Token20Instruction,
        state::{Aeko20Account, Aeko20Mint, MintPolicy},
    },
    aeko_token_721_program::state::{Aeko721Collection, Aeko721Token},
    anyhow::{anyhow, bail, Context, Result},
    base64::{prelude::BASE64_STANDARD, Engine},
    borsh::BorshDeserialize,
    reqwest::blocking::Client,
    serde::de::DeserializeOwned,
    serde::Deserialize,
    serde_json::{json, Value},
    std::collections::{BTreeMap, BTreeSet, HashMap},
};

const MAX_MULTIPLE_ACCOUNTS: usize = 100;

#[derive(Clone)]
pub struct RpcChainClient {
    pub config: ExplorerBackendConfig,
    client: Client,
}

#[derive(Debug)]
struct TransferDraft {
    signature: String,
    event_index: String,
    source: String,
    destination: String,
    amount: String,
    slot: u64,
}

#[derive(Debug, Deserialize)]
struct JsonRpcEnvelope<T> {
    result: Option<T>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct RpcContextResponse<T> {
    value: T,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FundingTransferStatus {
    Pending,
    Confirmed,
    Failed(String),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RpcFundingSignatureStatus {
    err: Option<Value>,
    confirmation_status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RpcFundingBlockhash {
    blockhash: String,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
    #[serde(default)]
    data: Option<Value>,
}

impl RpcChainClient {
    pub fn new(config: ExplorerBackendConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(config.rpc_timeout)
            .build()
            .context("building Explorer RPC client")?;
        Ok(Self { config, client })
    }

    pub fn health(&self) -> Result<()> {
        let status: String = self.rpc_request("getHealth", json!([]))?;
        if status != "ok" {
            bail!("validator RPC health is {status:?}, expected \"ok\"");
        }
        Ok(())
    }

    /// The durable Explorer projection follows finalized chain state. This
    /// keeps PostgreSQL monotonic without pretending we have reorg rollback
    /// support for merely confirmed slots.
    pub fn latest_slot(&self) -> Result<u64> {
        self.rpc_request("getSlot", json!([{ "commitment": "finalized" }]))
    }

    /// Current finalized epoch used when projecting Social anti-spam reputation.
    pub fn current_epoch(&self) -> Result<u64> {
        let value: Value =
            self.rpc_request("getEpochInfo", json!([{ "commitment": "finalized" }]))?;
        required_u64(&value, "epoch", "getEpochInfo")
    }

    /// Live account pages may use confirmed state because they are explicitly
    /// identified as RPC-backed live reads rather than durable history.
    pub fn fetch_account(&self, address: &str) -> Result<Option<ChainAccountRecord>> {
        Ok(self
            .fetch_account_with_data(address)?
            .map(|(account, _)| account))
    }

    /// Resolve a confirmed transaction directly from validator RPC when the
    /// finalized PostgreSQL projection has not reached it yet. This is a
    /// read-only fallback; confirmed data is never written into the durable
    /// finalized index from this path.
    pub fn fetch_transaction(&self, signature: &str) -> Result<Option<TransactionRecord>> {
        let requested = signature
            .parse::<Signature>()
            .with_context(|| format!("invalid AEKO transaction signature {signature:?}"))?;
        let value: Option<Value> = self.rpc_request(
            "getTransaction",
            json!([
                signature,
                {
                    "commitment": "confirmed",
                    "encoding": "json",
                    "maxSupportedTransactionVersion": 0
                }
            ]),
        )?;
        let Some(value) = value else {
            return Ok(None);
        };

        let slot = required_u64(&value, "slot", "getTransaction")?;
        let (record, _, _) = parse_transaction(slot, &value)?;
        let returned = record
            .signature
            .parse::<Signature>()
            .context("getTransaction returned an invalid primary signature")?;
        if returned != requested {
            bail!(
                "getTransaction signature mismatch: requested {signature}, returned {}",
                record.signature
            );
        }
        Ok(Some(record))
    }

    /// Resolve the full public transaction trace used by the Explorer detail page.
    ///
    /// Lists and search continue to use the compact TransactionRecord projection. The
    /// detail route calls this method on demand so PostgreSQL does not need to persist a
    /// second copy of variable-shape RPC metadata such as program logs and parsed
    /// instructions.
    pub fn fetch_transaction_detail(
        &self,
        signature: &str,
    ) -> Result<Option<TransactionDetailRecord>> {
        let requested = signature
            .parse::<Signature>()
            .with_context(|| format!("invalid AEKO transaction signature {signature:?}"))?;
        let value: Option<Value> = self.rpc_request(
            "getTransaction",
            json!([
                signature,
                {
                    "commitment": "confirmed",
                    "encoding": "jsonParsed",
                    "maxSupportedTransactionVersion": 0
                }
            ]),
        )?;
        let Some(value) = value else {
            return Ok(None);
        };

        let detail = parse_transaction_detail(&value)?;
        let returned = detail
            .signature
            .parse::<Signature>()
            .context("getTransaction returned an invalid primary signature")?;
        if returned != requested {
            bail!(
                "getTransaction signature mismatch: requested {signature}, returned {}",
                detail.signature
            );
        }
        Ok(Some(detail))
    }

    /// Protocol verification needs the account metadata plus raw account bytes
    /// so activation is proven from live chain state rather than registry text.
    pub fn fetch_account_with_data(
        &self,
        address: &str,
    ) -> Result<Option<(ChainAccountRecord, Vec<u8>)>> {
        let _: Pubkey = address
            .parse()
            .with_context(|| format!("invalid AEKO account address {address:?}"))?;
        let value: Option<Value> = self.rpc_context_value_request(
            "getAccountInfo",
            json!([address, {"commitment": "confirmed", "encoding": "base64"}]),
        )?;
        let Some(value) = value else {
            return Ok(None);
        };
        let lamports = required_u64(&value, "lamports", "getAccountInfo")?;
        let owner = required_str(&value, "owner", "getAccountInfo")?.to_string();
        let executable = value
            .get("executable")
            .and_then(Value::as_bool)
            .ok_or_else(|| anyhow!("getAccountInfo result is missing boolean executable"))?;
        let data = account_data_bytes(&value)
            .with_context(|| format!("decoding account data for {address}"))?;
        let data_len = data.len();
        Ok(Some((
            ChainAccountRecord {
                address: address.to_string(),
                lamports,
                owner,
                executable,
                data_len,
            },
            data,
        )))
    }
    pub fn fetch_core_slot(&self, slot: u64) -> Result<CoreSlotRecord> {
        let block: Option<Value> = self.rpc_request(
            "getBlock",
            json!([
                slot,
                {
                    "commitment": "finalized",
                    "encoding": "json",
                    "transactionDetails": "full",
                    "rewards": false,
                    "maxSupportedTransactionVersion": 0
                }
            ]),
        )?;
        let Some(block) = block else {
            // A finalized slot can legitimately be skipped. Advancing the
            // durable cursor over a null getBlock is correct; inventing an
            // empty block record is not.
            return Ok(CoreSlotRecord {
                slot,
                ..CoreSlotRecord::default()
            });
        };

        let blockhash = required_str(&block, "blockhash", "getBlock")?.to_string();
        if blockhash.is_empty() {
            bail!("getBlock({slot}) returned an empty blockhash");
        }
        let parent_slot = required_u64(&block, "parentSlot", "getBlock")?;
        let transactions = block
            .get("transactions")
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow!("getBlock({slot}) result is missing transactions array"))?;
        let unix_timestamp =
            match block.get("blockTime") {
                Some(value) if value.is_null() => None,
                Some(value) => Some(value.as_i64().ok_or_else(|| {
                    anyhow!("getBlock({slot}) blockTime is not an integer or null")
                })?),
                None => None,
            };
        let producer = self.slot_producer(slot)?;

        let block_record = BlockRecord {
            slot,
            blockhash,
            parent_slot,
            transaction_count: transactions.len() as u64,
            producer,
            unix_timestamp,
        };

        let mut records = Vec::with_capacity(transactions.len());
        let mut transaction_accounts = Vec::new();
        let mut transfer_drafts = Vec::new();
        for tx in transactions {
            let (record, account_keys, mut drafts) = parse_transaction(slot, tx)?;
            transaction_accounts.extend(account_keys.into_iter().enumerate().map(
                |(account_index, address)| TransactionAccountRecord {
                    signature: record.signature.clone(),
                    account_index,
                    address,
                },
            ));
            records.push(record);
            transfer_drafts.append(&mut drafts);
        }
        let token_transfers = self.resolve_transfer_mints(transfer_drafts)?;

        Ok(CoreSlotRecord {
            slot,
            block: Some(block_record),
            transactions: records,
            transaction_accounts,
            token_transfers,
        })
    }

    pub fn fetch_asset_snapshot(&self, slot: u64) -> Result<AssetSnapshot> {
        let token_program_accounts = self.fetch_program_accounts(&aeko_token_20_program::id())?;
        let nft_program_accounts = self.fetch_program_accounts(&aeko_token_721_program::id())?;

        let mut token_mints = Vec::new();
        let mut token_accounts = Vec::new();
        for account in token_program_accounts {
            let Some(address) = account.get("pubkey").and_then(Value::as_str) else {
                continue;
            };
            let Some(account_value) = account.get("account") else {
                continue;
            };
            let raw = account_data_bytes(account_value)
                .with_context(|| format!("decoding token-20 program account {address}"))?;

            if let Some(mint) = deserialize_exact_padded::<Aeko20Mint>(&raw) {
                if mint.is_initialized && !mint.name.is_empty() && !mint.symbol.is_empty() {
                    token_mints.push(TokenMintRecord {
                        mint: address.to_string(),
                        mint_authority: mint.mint_authority.map(|key| key.to_string()),
                        freeze_authority: mint.freeze_authority.map(|key| key.to_string()),
                        name: mint.name,
                        symbol: mint.symbol,
                        decimals: mint.decimals,
                        total_supply: mint.total_supply.to_string(),
                        supply_cap: mint.supply_cap.map(|value| value.to_string()),
                        metadata_uri: mint.metadata_uri,
                        mint_policy: mint_policy_label(mint.mint_policy).to_string(),
                        last_seen_slot: slot,
                    });
                    continue;
                }
            }

            if let Some(token) = deserialize_exact_padded::<Aeko20Account>(&raw) {
                if token.owner != Pubkey::default() && token.mint != Pubkey::default() {
                    token_accounts.push(TokenAccountRecord {
                        address: address.to_string(),
                        owner: token.owner.to_string(),
                        mint: token.mint.to_string(),
                        balance: token.balance.to_string(),
                        frozen: token.frozen,
                        last_seen_slot: slot,
                    });
                }
            }
        }

        let mut nft_collections = Vec::new();
        let mut nfts = Vec::new();
        for account in nft_program_accounts {
            let Some(address) = account.get("pubkey").and_then(Value::as_str) else {
                continue;
            };
            let Some(account_value) = account.get("account") else {
                continue;
            };
            let raw = account_data_bytes(account_value)
                .with_context(|| format!("decoding token-721 program account {address}"))?;

            if let Some(collection) = deserialize_exact_padded::<Aeko721Collection>(&raw) {
                if collection.is_initialized && !collection.name.is_empty() {
                    nft_collections.push(NftCollectionRecord {
                        collection_id: address.to_string(),
                        authority: collection.authority.to_string(),
                        name: collection.name,
                        symbol: collection.symbol,
                        base_uri: collection.base_uri,
                        total_minted: collection.total_minted,
                        last_seen_slot: slot,
                    });
                    continue;
                }
            }

            if let Some(token) = deserialize_exact_padded::<Aeko721Token>(&raw) {
                if token.is_initialized && !token.metadata.uri.is_empty() {
                    nfts.push(NftRecord {
                        token_id: address.to_string(),
                        collection_id: Some(token.collection.to_string()),
                        owner: token.owner.to_string(),
                        creator: token.creator.to_string(),
                        metadata_uri: Some(token.metadata.uri),
                        frozen: token.frozen,
                        last_seen_slot: slot,
                    });
                }
            }
        }

        Ok(AssetSnapshot {
            slot,
            token_mints,
            token_accounts,
            nft_collections,
            nfts,
        })
    }

    pub fn fetch_owned_state<T: BorshDeserialize>(
        &self,
        address: &str,
        expected_owner: Pubkey,
        label: &str,
    ) -> Result<T> {
        let value: Option<Value> = self.rpc_context_value_request(
            "getAccountInfo",
            json!([address, {"commitment": "finalized", "encoding": "base64"}]),
        )?;
        let Some(value) = value else {
            bail!("canonical {label} state account {address} does not exist");
        };
        let owner = required_str(&value, "owner", "getAccountInfo")?;
        if owner != expected_owner.to_string() {
            bail!("canonical {label} state owner mismatch: expected {expected_owner}, got {owner}");
        }
        let raw = account_data_bytes(&value)
            .with_context(|| format!("decoding canonical {label} state {address}"))?;
        deserialize_exact_padded::<T>(&raw).ok_or_else(|| {
            anyhow!("canonical {label} state {address} is not valid padded Borsh data")
        })
    }

    fn slot_producer(&self, slot: u64) -> Result<Option<String>> {
        let leaders: Vec<String> = match self.rpc_request("getSlotLeaders", json!([slot, 1u64])) {
            Ok(leaders) => leaders,
            Err(error) => {
                if let Some(rpc) = error.downcast_ref::<RpcRequestError>() {
                    if rpc.method == "getSlotLeaders" && rpc.code == -32602 {
                        // Expected on young chains (e.g. epoch 0 has no
                        // retrievable schedule): index the block without
                        // optional producer metadata instead of warning once
                        // per slot.
                        tracing::debug!(
                            slot,
                            rpc_code = rpc.code,
                            rpc_message = %rpc.message,
                            "historical leader schedule is unavailable; indexing block without optional producer metadata"
                        );
                        return Ok(None);
                    }
                }
                return Err(error).with_context(|| format!("resolving producer for slot {slot}"));
            }
        };
        let producer = leaders
            .first()
            .filter(|value| !value.is_empty())
            .ok_or_else(|| anyhow!("getSlotLeaders({slot}, 1) returned no leader"))?;
        let _: Pubkey = producer.parse().with_context(|| {
            format!("getSlotLeaders({slot}, 1) returned invalid pubkey {producer:?}")
        })?;
        Ok(Some(producer.clone()))
    }

    fn fetch_program_accounts(&self, program_id: &Pubkey) -> Result<Vec<Value>> {
        self.rpc_request(
            "getProgramAccounts",
            json!([
                program_id.to_string(),
                {"commitment": "finalized", "encoding": "base64"}
            ]),
        )
    }

    fn resolve_transfer_mints(
        &self,
        drafts: Vec<TransferDraft>,
    ) -> Result<Vec<TokenTransferRecord>> {
        if drafts.is_empty() {
            return Ok(Vec::new());
        }

        let addresses = drafts
            .iter()
            .flat_map(|draft| [&draft.source, &draft.destination])
            .cloned()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let mut mint_by_account = HashMap::<String, String>::new();

        for chunk in addresses.chunks(MAX_MULTIPLE_ACCOUNTS) {
            let values: Vec<Option<Value>> = self.rpc_context_value_request(
                "getMultipleAccounts",
                json!([chunk, {"commitment": "finalized", "encoding": "base64"}]),
            )?;
            if values.len() != chunk.len() {
                bail!(
                    "getMultipleAccounts returned {} values for {} requested token accounts",
                    values.len(),
                    chunk.len()
                );
            }
            for (address, value) in chunk.iter().zip(values) {
                let Some(value) = value else {
                    continue;
                };
                if value.get("owner").and_then(Value::as_str)
                    != Some(aeko_token_20_program::id().to_string().as_str())
                {
                    continue;
                }
                let raw = account_data_bytes(&value)
                    .with_context(|| format!("decoding token account {address}"))?;
                if let Some(account) = deserialize_exact_padded::<Aeko20Account>(&raw) {
                    if account.mint != Pubkey::default() {
                        mint_by_account.insert(address.clone(), account.mint.to_string());
                    }
                }
            }
        }

        let mut transfers = Vec::with_capacity(drafts.len());
        for draft in drafts {
            let source_mint = mint_by_account.get(&draft.source);
            let destination_mint = mint_by_account.get(&draft.destination);
            let mint = match (source_mint, destination_mint) {
                (Some(left), Some(right)) if left == right => Some(left.clone()),
                (Some(mint), None) | (None, Some(mint)) => Some(mint.clone()),
                (Some(left), Some(right)) => {
                    tracing::warn!(
                        signature = %draft.signature,
                        event_index = %draft.event_index,
                        source_mint = %left,
                        destination_mint = %right,
                        "skipping token transfer whose source and destination resolve to different mints"
                    );
                    None
                }
                (None, None) => None,
            };
            let Some(mint) = mint else {
                tracing::warn!(
                    signature = %draft.signature,
                    event_index = %draft.event_index,
                    source = %draft.source,
                    destination = %draft.destination,
                    "skipping token transfer because its mint could not be proven from on-chain token accounts"
                );
                continue;
            };
            transfers.push(TokenTransferRecord {
                mint,
                source: draft.source,
                destination: draft.destination,
                amount: draft.amount,
                signature: draft.signature,
                event_index: draft.event_index,
                slot: draft.slot,
            });
        }
        Ok(transfers)
    }

    pub fn latest_funding_blockhash(&self) -> Result<String> {
        let response: RpcContextResponse<RpcFundingBlockhash> =
            self.rpc_request("getLatestBlockhash", json!([{ "commitment": "confirmed" }]))?;
        if response.value.blockhash.trim().is_empty() {
            bail!("getLatestBlockhash returned an empty blockhash");
        }
        Ok(response.value.blockhash)
    }

    pub fn request_funding_airdrop(
        &self,
        address: &str,
        lamports: u64,
        recent_blockhash: Option<&str>,
    ) -> Result<String> {
        // Developer airdrop never carries the protected Funding credential.
        self.request_airdrop_inner(address, lamports, recent_blockhash)
    }

    /// Protected funding transfer path. Requires the server-only
    /// `AEKO_FUNDING_AUTHORIZATION_KEY` when the validator configures one.
    /// Used for public-request approvals and direct Admin funding. Replays of
    /// the same persisted (address, lamports, blockhash) intent recover the
    /// same signature so safe retry never creates a duplicate funding transfer.
    pub fn request_funding_transfer(
        &self,
        address: &str,
        lamports: u64,
        funding_authorization: Option<&str>,
        recent_blockhash: Option<&str>,
    ) -> Result<String> {
        let _: Pubkey = address
            .parse()
            .with_context(|| format!("invalid AEKO funding address {address:?}"))?;
        if lamports == 0 {
            bail!("funding amount must be greater than zero");
        }
        if recent_blockhash.is_some_and(|value| value.trim().is_empty()) {
            bail!("funding recent blockhash cannot be empty");
        }
        let config = json!({
            "fundingAuthorization": funding_authorization,
            "recentBlockhash": recent_blockhash,
        });
        self.rpc_request("requestFunding", json!([address, lamports, config]))
    }

    fn request_airdrop_inner(
        &self,
        address: &str,
        lamports: u64,
        recent_blockhash: Option<&str>,
    ) -> Result<String> {
        let _: Pubkey = address
            .parse()
            .with_context(|| format!("invalid AEKO funding address {address:?}"))?;
        if lamports == 0 {
            bail!("funding amount must be greater than zero");
        }
        if recent_blockhash.is_some_and(|value| value.trim().is_empty()) {
            bail!("funding recent blockhash cannot be empty");
        }
        let config = json!({ "recentBlockhash": recent_blockhash });
        self.rpc_request("requestAirdrop", json!([address, lamports, config]))
    }

    pub fn funding_transfer_status(&self, signature: &str) -> Result<FundingTransferStatus> {
        self.funding_transfer_status_with_blockhash(signature, None)
    }

    pub fn funding_transfer_status_with_blockhash(
        &self,
        signature: &str,
        recent_blockhash: Option<&str>,
    ) -> Result<FundingTransferStatus> {
        let _: Signature = signature
            .parse()
            .with_context(|| format!("invalid AEKO funding signature {signature:?}"))?;
        let statuses: Vec<Option<RpcFundingSignatureStatus>> = self.rpc_context_value_request(
            "getSignatureStatuses",
            json!([[signature], { "searchTransactionHistory": true }]),
        )?;
        let Some(status) = statuses.into_iter().next().flatten() else {
            if let Some(blockhash) = recent_blockhash {
                let _: Hash = blockhash
                    .parse()
                    .with_context(|| format!("invalid AEKO funding blockhash {blockhash:?}"))?;
                let valid: bool = self.rpc_context_value_request(
                    "isBlockhashValid",
                    json!([blockhash, { "commitment": "confirmed" }]),
                )?;
                if !valid {
                    return Ok(FundingTransferStatus::Failed(
                        "funding transaction blockhash expired before the transaction was observed"
                            .to_string(),
                    ));
                }
            }
            return Ok(FundingTransferStatus::Pending);
        };
        if let Some(error) = status.err {
            return Ok(FundingTransferStatus::Failed(error.to_string()));
        }
        match status.confirmation_status.as_deref() {
            Some("confirmed" | "finalized") => Ok(FundingTransferStatus::Confirmed),
            _ => Ok(FundingTransferStatus::Pending),
        }
    }

    pub fn wait_for_funding_transfer(
        &self,
        signature: &str,
        attempts: u32,
        interval: std::time::Duration,
    ) -> Result<FundingTransferStatus> {
        self.wait_for_funding_transfer_with_blockhash(signature, None, attempts, interval)
    }

    pub fn wait_for_funding_transfer_with_blockhash(
        &self,
        signature: &str,
        recent_blockhash: Option<&str>,
        attempts: u32,
        interval: std::time::Duration,
    ) -> Result<FundingTransferStatus> {
        for attempt in 0..attempts {
            let status =
                self.funding_transfer_status_with_blockhash(signature, recent_blockhash)?;
            if status != FundingTransferStatus::Pending {
                return Ok(status);
            }
            if attempt + 1 < attempts {
                std::thread::sleep(interval);
            }
        }
        Ok(FundingTransferStatus::Pending)
    }

    fn rpc_context_value_request<T: DeserializeOwned>(
        &self,
        method: &str,
        params: Value,
    ) -> Result<T> {
        let response: RpcContextResponse<T> = self.rpc_request(method, params)?;
        Ok(response.value)
    }

    fn rpc_request<T: DeserializeOwned>(&self, method: &str, params: Value) -> Result<T> {
        let response = self
            .client
            .post(&self.config.rpc_url)
            .json(&json!({
                "jsonrpc": "2.0",
                "id": 1u64,
                "method": method,
                "params": params,
            }))
            .send()
            .with_context(|| format!("RPC request failed for {method}"))?
            .error_for_status()
            .with_context(|| format!("RPC HTTP error for {method}"))?;
        let envelope: JsonRpcEnvelope<T> = response
            .json()
            .with_context(|| format!("RPC response decode failed for {method}"))?;
        if let Some(error) = envelope.error {
            return Err(RpcRequestError::new(method, error.code, error.message, error.data).into());
        }
        envelope
            .result
            .ok_or_else(|| anyhow!("RPC {method} response contained neither result nor error"))
    }
}

fn parse_transaction_detail(value: &Value) -> Result<TransactionDetailRecord> {
    let slot = required_u64(value, "slot", "getTransaction")?;
    let transaction = value
        .get("transaction")
        .ok_or_else(|| anyhow!("getTransaction({slot}) is missing transaction"))?;
    let signatures = transaction
        .get("signatures")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("getTransaction({slot}) transaction is missing signatures"))?;
    let signature = signatures
        .first()
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("getTransaction({slot}) transaction has no primary signature"))?
        .to_string();
    let message = transaction
        .get("message")
        .ok_or_else(|| anyhow!("transaction {signature} is missing message"))?;
    let meta = value
        .get("meta")
        .filter(|value| !value.is_null())
        .ok_or_else(|| anyhow!("transaction {signature} is missing meta"))?;
    let err = meta
        .get("err")
        .ok_or_else(|| anyhow!("transaction {signature} meta is missing err"))?;
    let success = err.is_null();
    let fee = required_u64(meta, "fee", "transaction meta")?;

    let accounts = transaction_account_details(message, meta, &signature)?;
    let signer = accounts
        .iter()
        .find(|account| account.signer == Some(true))
        .or_else(|| accounts.first())
        .map(|account| account.address.clone());

    let instruction_values = message
        .get("instructions")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("transaction {signature} message is missing instructions"))?;
    let instructions = instruction_values
        .iter()
        .enumerate()
        .map(|(index, instruction)| {
            parse_transaction_instruction_detail(index, instruction, &accounts, &signature)
        })
        .collect::<Result<Vec<_>>>()?;
    let primary_program = instructions.first().map(|item| item.program_id.clone());

    let inner_instructions = meta
        .get("innerInstructions")
        .and_then(Value::as_array)
        .map(|groups| {
            groups
                .iter()
                .map(|group| {
                    let parent_index =
                        required_u64(group, "index", "innerInstructions")? as usize;
                    let items = group
                        .get("instructions")
                        .and_then(Value::as_array)
                        .ok_or_else(|| {
                            anyhow!(
                                "transaction {signature} innerInstructions[{parent_index}] has no instructions"
                            )
                        })?;
                    let instructions = items
                        .iter()
                        .enumerate()
                        .map(|(index, instruction)| {
                            parse_transaction_instruction_detail(
                                index,
                                instruction,
                                &accounts,
                                &signature,
                            )
                        })
                        .collect::<Result<Vec<_>>>()?;
                    Ok(TransactionInnerInstructionGroupRecord {
                        index: parent_index,
                        instructions,
                    })
                })
                .collect::<Result<Vec<_>>>()
        })
        .transpose()?
        .unwrap_or_default();

    let log_messages = meta
        .get("logMessages")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let token_balance_changes = transaction_token_balance_changes(meta, &signature)?;

    let block_time = match value.get("blockTime") {
        Some(Value::Number(number)) => number.as_i64(),
        _ => None,
    };
    let recent_blockhash = message
        .get("recentBlockhash")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let version = match value.get("version") {
        Some(Value::String(value)) => Some(value.clone()),
        Some(Value::Number(value)) => Some(value.to_string()),
        _ => None,
    };
    let error = (!err.is_null()).then(|| err.clone());
    let compute_units_consumed = meta
        .get("computeUnitsConsumed")
        .and_then(Value::as_u64);
    let return_data = meta
        .get("returnData")
        .filter(|value| !value.is_null())
        .cloned();

    Ok(TransactionDetailRecord {
        signature,
        slot,
        success,
        fee,
        primary_program,
        signer,
        block_time,
        recent_blockhash,
        version,
        error,
        compute_units_consumed,
        accounts,
        instructions,
        inner_instructions,
        token_balance_changes,
        token_transfers: Vec::new(),
        log_messages,
        return_data,
        raw_transaction: Some(value.clone()),
        detail_available: true,
    })
}

fn transaction_account_details(
    message: &Value,
    meta: &Value,
    signature: &str,
) -> Result<Vec<TransactionAccountDetailRecord>> {
    let raw_keys = message
        .get("accountKeys")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("transaction {signature} message is missing accountKeys"))?;
    let static_count = raw_keys.len();
    let header = message.get("header");
    let required_signatures = header
        .and_then(|value| value.get("numRequiredSignatures"))
        .and_then(Value::as_u64)
        .map(|value| value as usize);
    let readonly_signed = header
        .and_then(|value| value.get("numReadonlySignedAccounts"))
        .and_then(Value::as_u64)
        .map(|value| value as usize);
    let readonly_unsigned = header
        .and_then(|value| value.get("numReadonlyUnsignedAccounts"))
        .and_then(Value::as_u64)
        .map(|value| value as usize);

    let inferred_flags = |index: usize| -> (Option<bool>, Option<bool>) {
        let (Some(required), Some(readonly_signed), Some(readonly_unsigned)) =
            (required_signatures, readonly_signed, readonly_unsigned)
        else {
            return (None, None);
        };
        if index >= static_count || required > static_count {
            return (None, None);
        }

        let signer = index < required;
        let writable = if signer {
            index < required.saturating_sub(readonly_signed)
        } else {
            index < static_count.saturating_sub(readonly_unsigned)
        };
        (Some(signer), Some(writable))
    };

    let has_lookup_source = raw_keys.iter().any(|value| {
        value
            .get("source")
            .and_then(Value::as_str)
            .is_some_and(|source| source.eq_ignore_ascii_case("lookupTable"))
    });

    let mut accounts = Vec::with_capacity(raw_keys.len());
    for (index, value) in raw_keys.iter().enumerate() {
        let (inferred_signer, inferred_writable) = inferred_flags(index);
        let (address, signer, writable, source) = if let Some(address) = value.as_str() {
            (
                address.to_string(),
                inferred_signer,
                inferred_writable,
                Some("transaction".to_string()),
            )
        } else {
            let address = value
                .get("pubkey")
                .and_then(Value::as_str)
                .filter(|address| !address.is_empty())
                .ok_or_else(|| anyhow!("transaction {signature} has an invalid account key"))?
                .to_string();
            (
                address,
                value
                    .get("signer")
                    .and_then(Value::as_bool)
                    .or(inferred_signer),
                value
                    .get("writable")
                    .and_then(Value::as_bool)
                    .or(inferred_writable),
                value
                    .get("source")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or_else(|| Some("transaction".to_string())),
            )
        };
        accounts.push(TransactionAccountDetailRecord {
            index,
            address,
            signer,
            writable,
            source,
            pre_balance: None,
            post_balance: None,
        });
    }

    if !has_lookup_source {
        if let Some(loaded) = meta.get("loadedAddresses").filter(|value| !value.is_null()) {
            for (field, writable) in [("writable", true), ("readonly", false)] {
                if let Some(items) = loaded.get(field).and_then(Value::as_array) {
                    for value in items {
                        let address = value.as_str().ok_or_else(|| {
                            anyhow!(
                                "transaction {signature} loadedAddresses.{field} contains a non-string"
                            )
                        })?;
                        accounts.push(TransactionAccountDetailRecord {
                            index: accounts.len(),
                            address: address.to_string(),
                            signer: Some(false),
                            writable: Some(writable),
                            source: Some("lookupTable".to_string()),
                            pre_balance: None,
                            post_balance: None,
                        });
                    }
                }
            }
        }
    }

    let pre_balances = meta.get("preBalances").and_then(Value::as_array);
    let post_balances = meta.get("postBalances").and_then(Value::as_array);
    for account in &mut accounts {
        account.pre_balance = pre_balances
            .and_then(|items| items.get(account.index))
            .and_then(Value::as_u64)
            .map(|value| value.to_string());
        account.post_balance = post_balances
            .and_then(|items| items.get(account.index))
            .and_then(Value::as_u64)
            .map(|value| value.to_string());
    }

    Ok(accounts)
}

fn parse_transaction_instruction_detail(
    index: usize,
    instruction: &Value,
    accounts: &[TransactionAccountDetailRecord],
    signature: &str,
) -> Result<TransactionInstructionDetailRecord> {
    let program_id = if let Some(value) = instruction.get("programId").and_then(Value::as_str) {
        value.to_string()
    } else {
        let program_index = instruction
            .get("programIdIndex")
            .and_then(Value::as_u64)
            .ok_or_else(|| {
                anyhow!(
                    "transaction {signature} instruction {index} has no programId/programIdIndex"
                )
            })? as usize;
        accounts
            .get(program_index)
            .map(|account| account.address.clone())
            .ok_or_else(|| {
                anyhow!(
                    "transaction {signature} instruction {index} programIdIndex {program_index} is out of bounds"
                )
            })?
    };

    let referenced_accounts = instruction
        .get("accounts")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|value| {
                    if let Some(address) = value.as_str() {
                        return Ok(address.to_string());
                    }
                    let account_index = value.as_u64().ok_or_else(|| {
                        anyhow!(
                            "transaction {signature} instruction {index} has an invalid account reference"
                        )
                    })? as usize;
                    accounts
                        .get(account_index)
                        .map(|account| account.address.clone())
                        .ok_or_else(|| {
                            anyhow!(
                                "transaction {signature} instruction {index} account index {account_index} is out of bounds"
                            )
                        })
                })
                .collect::<Result<Vec<_>>>()
        })
        .transpose()?
        .unwrap_or_default();

    Ok(TransactionInstructionDetailRecord {
        index,
        program_id,
        program: instruction
            .get("program")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        accounts: referenced_accounts,
        data: instruction
            .get("data")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        parsed: instruction
            .get("parsed")
            .filter(|value| !value.is_null())
            .cloned(),
        stack_height: instruction.get("stackHeight").and_then(Value::as_u64),
    })
}

#[derive(Default)]
struct TokenBalanceAccumulator {
    decimals: u8,
    pre_amount: Option<String>,
    post_amount: Option<String>,
    pre_ui_amount: Option<String>,
    post_ui_amount: Option<String>,
}

fn transaction_token_balance_changes(
    meta: &Value,
    signature: &str,
) -> Result<Vec<TransactionTokenBalanceChangeRecord>> {
    type TokenKey = (usize, String, Option<String>, Option<String>);
    let mut balances = BTreeMap::<TokenKey, TokenBalanceAccumulator>::new();

    for (field, before) in [("preTokenBalances", true), ("postTokenBalances", false)] {
        let Some(items) = meta.get(field).and_then(Value::as_array) else {
            continue;
        };
        for item in items {
            let account_index = required_u64(item, "accountIndex", field)? as usize;
            let mint = required_str(item, "mint", field)?.to_string();
            let owner = item
                .get("owner")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            let program_id = item
                .get("programId")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            let ui = item
                .get("uiTokenAmount")
                .ok_or_else(|| anyhow!("transaction {signature} {field} entry has no uiTokenAmount"))?;
            let amount = required_str(ui, "amount", "uiTokenAmount")?.to_string();
            let decimals = required_u64(ui, "decimals", "uiTokenAmount")?;
            let decimals = u8::try_from(decimals)
                .with_context(|| format!("transaction {signature} token decimals exceed u8"))?;
            let ui_amount = ui
                .get("uiAmountString")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);

            let entry = balances
                .entry((account_index, mint, owner, program_id))
                .or_insert_with(|| TokenBalanceAccumulator {
                    decimals,
                    ..TokenBalanceAccumulator::default()
                });
            entry.decimals = decimals;
            if before {
                entry.pre_amount = Some(amount);
                entry.pre_ui_amount = ui_amount;
            } else {
                entry.post_amount = Some(amount);
                entry.post_ui_amount = ui_amount;
            }
        }
    }

    Ok(balances
        .into_iter()
        .map(
            |((account_index, mint, owner, program_id), value)| {
                TransactionTokenBalanceChangeRecord {
                    account_index,
                    mint,
                    owner,
                    program_id,
                    decimals: value.decimals,
                    pre_amount: value.pre_amount,
                    post_amount: value.post_amount,
                    pre_ui_amount: value.pre_ui_amount,
                    post_ui_amount: value.post_ui_amount,
                }
            },
        )
        .collect())
}

fn parse_transaction(
    slot: u64,
    value: &Value,
) -> Result<(TransactionRecord, Vec<String>, Vec<TransferDraft>)> {
    let transaction = value
        .get("transaction")
        .ok_or_else(|| anyhow!("slot {slot} transaction entry is missing transaction"))?;
    let signatures = transaction
        .get("signatures")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("slot {slot} transaction is missing signatures"))?;
    let signature = signatures
        .first()
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("slot {slot} transaction has no primary signature"))?
        .to_string();
    let message = transaction
        .get("message")
        .ok_or_else(|| anyhow!("transaction {signature} is missing message"))?;
    let meta = value
        .get("meta")
        .filter(|value| !value.is_null())
        .ok_or_else(|| anyhow!("transaction {signature} is missing meta"))?;
    let err = meta
        .get("err")
        .ok_or_else(|| anyhow!("transaction {signature} meta is missing err"))?;
    let success = err.is_null();
    let fee = required_u64(meta, "fee", "transaction meta")?;
    let account_keys = transaction_account_keys(message, meta, &signature)?;
    let signer = account_keys.first().cloned();
    let instructions = message
        .get("instructions")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("transaction {signature} message is missing instructions"))?;
    let primary_program = instructions
        .first()
        .map(|instruction| resolve_program_id(instruction, &account_keys, &signature))
        .transpose()?;

    let mut drafts = Vec::new();
    if success {
        for (index, instruction) in instructions.iter().enumerate() {
            if let Some(draft) = parse_token_transfer(
                instruction,
                &account_keys,
                signature.clone(),
                index.to_string(),
                slot,
            )? {
                drafts.push(draft);
            }
        }
        if let Some(inner_groups) = meta.get("innerInstructions").and_then(Value::as_array) {
            for group in inner_groups {
                let parent = required_u64(group, "index", "innerInstructions")? as usize;
                let inner = group
                    .get("instructions")
                    .and_then(Value::as_array)
                    .ok_or_else(|| {
                        anyhow!("transaction {signature} innerInstructions[{parent}] has no instructions")
                    })?;
                for (inner_index, instruction) in inner.iter().enumerate() {
                    if let Some(draft) = parse_token_transfer(
                        instruction,
                        &account_keys,
                        signature.clone(),
                        format!("{parent}:{inner_index}"),
                        slot,
                    )? {
                        drafts.push(draft);
                    }
                }
            }
        }
    }

    Ok((
        TransactionRecord {
            signature,
            slot,
            success,
            fee,
            primary_program,
            signer,
        },
        account_keys,
        drafts,
    ))
}

fn transaction_account_keys(message: &Value, meta: &Value, signature: &str) -> Result<Vec<String>> {
    let static_keys = message
        .get("accountKeys")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("transaction {signature} message is missing accountKeys"))?;
    let mut keys = Vec::with_capacity(static_keys.len());
    for value in static_keys {
        let key = value
            .as_str()
            .or_else(|| value.get("pubkey").and_then(Value::as_str))
            .filter(|key| !key.is_empty())
            .ok_or_else(|| anyhow!("transaction {signature} has an invalid account key entry"))?;
        keys.push(key.to_string());
    }

    if let Some(loaded) = meta.get("loadedAddresses").filter(|value| !value.is_null()) {
        for field in ["writable", "readonly"] {
            if let Some(items) = loaded.get(field).and_then(Value::as_array) {
                for value in items {
                    let key = value.as_str().ok_or_else(|| {
                        anyhow!(
                            "transaction {signature} loadedAddresses.{field} contains a non-string"
                        )
                    })?;
                    keys.push(key.to_string());
                }
            }
        }
    }
    Ok(keys)
}

fn resolve_program_id(instruction: &Value, keys: &[String], signature: &str) -> Result<String> {
    if let Some(program_id) = instruction.get("programId").and_then(Value::as_str) {
        return Ok(program_id.to_string());
    }
    let index = instruction
        .get("programIdIndex")
        .and_then(Value::as_u64)
        .ok_or_else(|| {
            anyhow!("transaction {signature} instruction has no programId/programIdIndex")
        })? as usize;
    keys.get(index)
        .cloned()
        .ok_or_else(|| anyhow!("transaction {signature} programIdIndex {index} is out of bounds"))
}

fn parse_token_transfer(
    instruction: &Value,
    keys: &[String],
    signature: String,
    event_index: String,
    slot: u64,
) -> Result<Option<TransferDraft>> {
    if resolve_program_id(instruction, keys, &signature)? != aeko_token_20_program::id().to_string()
    {
        return Ok(None);
    }
    let encoded = instruction
        .get("data")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("token-20 instruction {signature}:{event_index} is missing data"))?;
    let data = bs58::decode(encoded)
        .into_vec()
        .with_context(|| format!("decoding token-20 instruction {signature}:{event_index}"))?;
    let decoded = Token20Instruction::try_from_slice(&data).with_context(|| {
        format!("decoding token-20 instruction payload {signature}:{event_index}")
    })?;
    let account_indexes = instruction
        .get("accounts")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("token-20 instruction {signature}:{event_index} has no accounts"))?;
    let account = |position: usize| -> Result<String> {
        let index = account_indexes
            .get(position)
            .and_then(Value::as_u64)
            .ok_or_else(|| {
                anyhow!(
                    "token-20 instruction {signature}:{event_index} account {position} is missing"
                )
            })? as usize;
        keys.get(index).cloned().ok_or_else(|| {
            anyhow!("token-20 instruction {signature}:{event_index} account index {index} is out of bounds")
        })
    };

    let (source, destination, amount) = match decoded {
        Token20Instruction::Transfer { amount } => (account(0)?, account(1)?, amount),
        Token20Instruction::TransferFrom { amount } => (account(1)?, account(2)?, amount),
        _ => return Ok(None),
    };
    Ok(Some(TransferDraft {
        signature,
        event_index,
        source,
        destination,
        amount: amount.to_string(),
        slot,
    }))
}

fn account_data_bytes(account: &Value) -> Result<Vec<u8>> {
    let data = account
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("account response is missing data tuple"))?;
    let encoded = data
        .first()
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("account response data tuple has no base64 payload"))?;
    let encoding = data.get(1).and_then(Value::as_str).unwrap_or("base64");
    if encoding != "base64" {
        bail!("account response used unsupported encoding {encoding:?}");
    }
    BASE64_STANDARD
        .decode(encoded)
        .context("decoding base64 account data")
}

fn deserialize_exact_padded<T: BorshDeserialize>(data: &[u8]) -> Option<T> {
    let mut input = data;
    let value = T::deserialize(&mut input).ok()?;
    if input.iter().any(|byte| *byte != 0) {
        return None;
    }
    Some(value)
}

fn required_str<'a>(value: &'a Value, key: &str, context: &str) -> Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("{context} is missing string field {key}"))
}

fn required_u64(value: &Value, key: &str, context: &str) -> Result<u64> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| anyhow!("{context} is missing unsigned integer field {key}"))
}

fn mint_policy_label(policy: MintPolicy) -> &'static str {
    match policy {
        MintPolicy::FixedSupply => "fixed-supply",
        MintPolicy::AuthorityGated => "authority-gated",
        MintPolicy::EmissionsControlled => "emissions-controlled",
        MintPolicy::PublicMintControlled => "public-mint-controlled",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, PartialEq, borsh::BorshSerialize, borsh::BorshDeserialize)]
    struct EndsWithEmptyVec {
        prefix: u8,
        items: Vec<u8>,
    }

    #[test]
    fn padded_borsh_decoder_preserves_legitimate_trailing_zero_bytes() {
        let value = EndsWithEmptyVec {
            prefix: 7,
            items: Vec::new(),
        };
        let mut data = borsh::to_vec(&value).unwrap();
        assert!(data.ends_with(&[0, 0, 0, 0]));
        data.resize(64, 0);

        assert_eq!(
            deserialize_exact_padded::<EndsWithEmptyVec>(&data),
            Some(value)
        );
    }

    #[test]
    fn padded_borsh_decoder_rejects_non_zero_unread_bytes() {
        let value = EndsWithEmptyVec {
            prefix: 7,
            items: Vec::new(),
        };
        let mut data = borsh::to_vec(&value).unwrap();
        data.extend_from_slice(&[0, 0, 9]);

        assert!(deserialize_exact_padded::<EndsWithEmptyVec>(&data).is_none());
    }

    #[test]
    fn malformed_block_fields_are_errors_not_defaults() {
        let value = json!({"parentSlot": 1, "transactions": []});
        assert!(required_str(&value, "blockhash", "getBlock").is_err());
    }

    #[test]
    fn historical_block_indexes_when_epoch_leader_schedule_has_expired() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let responses = [
                json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {
                        "blockhash": "historical-blockhash",
                        "parentSlot": 0,
                        "transactions": [],
                        "blockTime": null
                    }
                }),
                json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "error": {
                        "code": -32602,
                        "message": "Invalid slot range: leader schedule for epoch 0 is unavailable"
                    }
                }),
            ];

            for body in responses {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                    .unwrap();
                let mut request = [0u8; 8192];
                let _ = std::io::Read::read(&mut stream, &mut request).unwrap();
                let body = body.to_string();
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                std::io::Write::write_all(&mut stream, response.as_bytes()).unwrap();
            }
        });

        let config = ExplorerBackendConfig {
            rpc_url: format!("http://{address}"),
            ..ExplorerBackendConfig::default()
        };
        let client = RpcChainClient::new(config).unwrap();
        let record = client.fetch_core_slot(0).unwrap();
        server.join().unwrap();

        let block = record
            .block
            .expect("historical block should still be indexed");
        assert_eq!(block.slot, 0);
        assert_eq!(block.producer, None);
    }

    #[test]
    fn contextual_account_response_decodes_account_and_null_values() {
        let account: RpcContextResponse<Option<Value>> = serde_json::from_value(json!({
            "context": {"slot": 42},
            "value": {"owner": "owner", "lamports": 7, "executable": false, "data": ["", "base64"]}
        }))
        .unwrap();
        assert_eq!(
            account
                .value
                .as_ref()
                .and_then(|value| value.get("owner"))
                .and_then(Value::as_str),
            Some("owner")
        );

        let missing: RpcContextResponse<Option<Value>> = serde_json::from_value(json!({
            "context": {"slot": 42},
            "value": null
        }))
        .unwrap();
        assert!(missing.value.is_none());
    }

    #[test]
    fn contextual_multiple_accounts_response_preserves_null_entries() {
        let response: RpcContextResponse<Vec<Option<Value>>> = serde_json::from_value(json!({
            "context": {"slot": 42},
            "value": [{"owner": "owner"}, null]
        }))
        .unwrap();
        assert_eq!(response.value.len(), 2);
        assert!(response.value[0].is_some());
        assert!(response.value[1].is_none());
    }

    #[test]
    fn token_transfer_parser_reads_compiled_account_indexes() {
        let source = Pubkey::new_unique().to_string();
        let destination = Pubkey::new_unique().to_string();
        let owner = Pubkey::new_unique().to_string();
        let program = aeko_token_20_program::id().to_string();
        let instruction_data = borsh::to_vec(&Token20Instruction::Transfer { amount: 77 }).unwrap();
        let instruction = json!({
            "programIdIndex": 3,
            "accounts": [0, 1, 2],
            "data": bs58::encode(instruction_data).into_string()
        });
        let keys = vec![source.clone(), destination.clone(), owner, program];
        let draft = parse_token_transfer(&instruction, &keys, "sig".into(), "0".into(), 5)
            .unwrap()
            .unwrap();
        assert_eq!(draft.source, source);
        assert_eq!(draft.destination, destination);
        assert_eq!(draft.amount, "77");
        assert_eq!(draft.event_index, "0");
    }

    #[test]
    fn transaction_parser_preserves_static_and_loaded_accounts() {
        let payer = Pubkey::new_unique().to_string();
        let program = Pubkey::new_unique().to_string();
        let writable = Pubkey::new_unique().to_string();
        let readonly = Pubkey::new_unique().to_string();
        let value = json!({
            "transaction": {
                "signatures": ["signature"],
                "message": {
                    "accountKeys": [payer.clone(), program.clone()],
                    "instructions": []
                }
            },
            "meta": {
                "err": null,
                "fee": 5000,
                "loadedAddresses": {
                    "writable": [writable.clone()],
                    "readonly": [readonly.clone()]
                }
            }
        });

        let (_, accounts, _) = parse_transaction(9, &value).unwrap();
        assert_eq!(accounts, vec![payer, program, writable, readonly]);
    }

    #[test]
    fn transaction_detail_parser_preserves_rpc_trace_context() {
        let payer = Pubkey::new_unique().to_string();
        let program = Pubkey::new_unique().to_string();
        let token_account = Pubkey::new_unique().to_string();
        let mint = Pubkey::new_unique().to_string();
        let value = json!({
            "slot": 77,
            "blockTime": 1_700_000_123,
            "version": 0,
            "transaction": {
                "signatures": ["signature"],
                "message": {
                    "recentBlockhash": "recent-blockhash",
                    "accountKeys": [
                        {"pubkey": payer.clone(), "signer": true, "writable": true, "source": "transaction"},
                        {"pubkey": program.clone(), "signer": false, "writable": false, "source": "transaction"},
                        {"pubkey": token_account.clone(), "signer": false, "writable": true, "source": "transaction"}
                    ],
                    "instructions": [{
                        "program": "system",
                        "programId": program.clone(),
                        "parsed": {
                            "type": "transfer",
                            "info": {"source": payer.clone(), "destination": token_account.clone()}
                        },
                        "stackHeight": 1
                    }]
                }
            },
            "meta": {
                "err": null,
                "fee": 5000,
                "preBalances": [10000, 1, 10],
                "postBalances": [4000, 1, 6000],
                "computeUnitsConsumed": 99,
                "logMessages": ["Program invoke [1]", "Program success"],
                "preTokenBalances": [{
                    "accountIndex": 2,
                    "mint": mint.clone(),
                    "owner": payer.clone(),
                    "programId": program.clone(),
                    "uiTokenAmount": {
                        "amount": "10",
                        "decimals": 2,
                        "uiAmountString": "0.10"
                    }
                }],
                "postTokenBalances": [{
                    "accountIndex": 2,
                    "mint": mint.clone(),
                    "owner": payer.clone(),
                    "programId": program.clone(),
                    "uiTokenAmount": {
                        "amount": "25",
                        "decimals": 2,
                        "uiAmountString": "0.25"
                    }
                }],
                "innerInstructions": [{
                    "index": 0,
                    "instructions": [{
                        "programId": program.clone(),
                        "accounts": [payer.clone(), token_account.clone()],
                        "data": "abc",
                        "stackHeight": 2
                    }]
                }],
                "returnData": {
                    "programId": program.clone(),
                    "data": ["AQID", "base64"]
                }
            }
        });

        let detail = parse_transaction_detail(&value).unwrap();
        assert_eq!(detail.signature, "signature");
        assert_eq!(detail.slot, 77);
        assert!(detail.success);
        assert_eq!(detail.block_time, Some(1_700_000_123));
        assert_eq!(detail.version.as_deref(), Some("0"));
        assert_eq!(detail.recent_blockhash.as_deref(), Some("recent-blockhash"));
        assert_eq!(detail.compute_units_consumed, Some(99));
        assert_eq!(detail.signer.as_deref(), Some(payer.as_str()));
        assert_eq!(detail.primary_program.as_deref(), Some(program.as_str()));
        assert_eq!(detail.accounts.len(), 3);
        assert_eq!(detail.accounts[0].signer, Some(true));
        assert_eq!(detail.accounts[0].pre_balance.as_deref(), Some("10000"));
        assert_eq!(detail.accounts[2].post_balance.as_deref(), Some("6000"));
        assert_eq!(detail.instructions.len(), 1);
        assert_eq!(
            detail.instructions[0]
                .parsed
                .as_ref()
                .and_then(|parsed| parsed.get("type"))
                .and_then(Value::as_str),
            Some("transfer")
        );
        assert_eq!(detail.inner_instructions.len(), 1);
        assert_eq!(detail.inner_instructions[0].instructions.len(), 1);
        assert_eq!(detail.token_balance_changes.len(), 1);
        assert_eq!(
            detail.token_balance_changes[0].pre_amount.as_deref(),
            Some("10")
        );
        assert_eq!(
            detail.token_balance_changes[0].post_amount.as_deref(),
            Some("25")
        );
        assert_eq!(detail.log_messages.len(), 2);
        assert!(detail.return_data.is_some());
        assert!(detail.raw_transaction.is_some());
        assert!(detail.detail_available);
    }

    #[test]
    fn failed_transactions_never_emit_transfer_events() {
        let payer = Pubkey::new_unique().to_string();
        let destination = Pubkey::new_unique().to_string();
        let owner = Pubkey::new_unique().to_string();
        let program = aeko_token_20_program::id().to_string();
        let instruction_data = borsh::to_vec(&Token20Instruction::Transfer { amount: 4 }).unwrap();
        let value = json!({
            "transaction": {
                "signatures": ["signature"],
                "message": {
                    "accountKeys": [payer, destination, owner, program],
                    "instructions": [{
                        "programIdIndex": 3,
                        "accounts": [0, 1, 2],
                        "data": bs58::encode(instruction_data).into_string()
                    }]
                }
            },
            "meta": {"err": {"InstructionError": [0, "Custom"]}, "fee": 5000}
        });
        let (_, _, drafts) = parse_transaction(9, &value).unwrap();
        assert!(drafts.is_empty());
    }
}
