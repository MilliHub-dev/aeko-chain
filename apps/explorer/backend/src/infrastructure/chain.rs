use {
    crate::{
        config::ExplorerBackendConfig,
        models::{
            AssetSnapshot, BlockRecord, ChainAccountRecord, CoreSlotRecord, NftCollectionRecord,
            NftRecord, TokenAccountRecord, TokenMintRecord, TokenTransferRecord,
            TransactionAccountRecord, TransactionRecord,
        },
    },
    anyhow::{anyhow, bail, Context, Result},
    base64::{prelude::BASE64_STANDARD, Engine},
    borsh::BorshDeserialize,
    reqwest::blocking::Client,
    serde::de::DeserializeOwned,
    serde::Deserialize,
    serde_json::{json, Value},
    std::collections::{BTreeSet, HashMap},
    aeko_sdk::pubkey::Pubkey,
    aeko_token_20_program::{
        instruction::Token20Instruction,
        state::{Aeko20Account, Aeko20Mint, MintPolicy},
    },
    aeko_token_721_program::state::{Aeko721Collection, Aeko721Token},
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

    /// Live account pages may use confirmed state because they are explicitly
    /// identified as RPC-backed live reads rather than durable history.
    pub fn fetch_account(&self, address: &str) -> Result<Option<ChainAccountRecord>> {
        let _: Pubkey = address
            .parse()
            .with_context(|| format!("invalid AEKO account address {address:?}"))?;
        let value: Value = self.rpc_request(
            "getAccountInfo",
            json!([address, {"commitment": "confirmed", "encoding": "base64"}]),
        )?;
        if value.is_null() {
            return Ok(None);
        }
        let lamports = required_u64(&value, "lamports", "getAccountInfo")?;
        let owner = required_str(&value, "owner", "getAccountInfo")?.to_string();
        let executable = value
            .get("executable")
            .and_then(Value::as_bool)
            .ok_or_else(|| anyhow!("getAccountInfo result is missing boolean executable"))?;
        let data = account_data_bytes(&value)
            .with_context(|| format!("decoding account data for {address}"))?;
        Ok(Some(ChainAccountRecord {
            address: address.to_string(),
            lamports,
            owner,
            executable,
            data_len: data.len(),
        }))
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
        let unix_timestamp = match block.get("blockTime") {
            Some(value) if value.is_null() => None,
            Some(value) => Some(
                value
                    .as_i64()
                    .ok_or_else(|| anyhow!("getBlock({slot}) blockTime is not an integer or null"))?,
            ),
            None => None,
        };

        let block_record = BlockRecord {
            slot,
            blockhash,
            parent_slot,
            transaction_count: transactions.len() as u64,
            producer: None,
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
        let value: Value = self.rpc_request(
            "getAccountInfo",
            json!([address, {"commitment": "finalized", "encoding": "base64"}]),
        )?;
        if value.is_null() {
            bail!("canonical {label} state account {address} does not exist");
        }
        let owner = required_str(&value, "owner", "getAccountInfo")?;
        if owner != expected_owner.to_string() {
            bail!(
                "canonical {label} state owner mismatch: expected {expected_owner}, got {owner}"
            );
        }
        let raw = account_data_bytes(&value)
            .with_context(|| format!("decoding canonical {label} state {address}"))?;
        deserialize_exact_padded::<T>(&raw).ok_or_else(|| {
            anyhow!("canonical {label} state {address} is not valid padded Borsh data")
        })
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
            let values: Vec<Option<Value>> = self.rpc_request(
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
            let suffix = error
                .data
                .map(|data| format!(" data={data}"))
                .unwrap_or_default();
            bail!("RPC {method} failed ({}): {}{suffix}", error.code, error.message);
        }
        envelope
            .result
            .ok_or_else(|| anyhow!("RPC {method} response contained neither result nor error"))
    }
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
                        anyhow!("transaction {signature} loadedAddresses.{field} contains a non-string")
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
        .ok_or_else(|| anyhow!("transaction {signature} instruction has no programId/programIdIndex"))?
        as usize;
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
    if resolve_program_id(instruction, keys, &signature)? != aeko_token_20_program::id().to_string() {
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
                anyhow!("token-20 instruction {signature}:{event_index} account {position} is missing")
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
    let encoding = data
        .get(1)
        .and_then(Value::as_str)
        .unwrap_or("base64");
    if encoding != "base64" {
        bail!("account response used unsupported encoding {encoding:?}");
    }
    BASE64_STANDARD
        .decode(encoded)
        .context("decoding base64 account data")
}

fn deserialize_exact_padded<T: BorshDeserialize>(data: &[u8]) -> Option<T> {
    let end = data
        .iter()
        .rposition(|byte| *byte != 0)
        .map(|index| index + 1)
        .unwrap_or(0);
    T::try_from_slice(&data[..end]).ok()
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

    #[test]
    fn malformed_block_fields_are_errors_not_defaults() {
        let value = json!({"parentSlot": 1, "transactions": []});
        assert!(required_str(&value, "blockhash", "getBlock").is_err());
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
