use {
    crate::config::ExplorerBackendConfig,
    anyhow::{anyhow, Context, Result},
    reqwest::blocking::Client,
    serde::de::DeserializeOwned,
    serde::Deserialize,
    serde_json::{json, Value},
};

#[derive(Debug, Deserialize)]
struct JsonRpcEnvelope<T> {
    result: Option<T>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

pub fn fetch_genesis_hash(config: &ExplorerBackendConfig) -> Result<String> {
    let genesis_hash: String = rpc_request(config, "getGenesisHash", json!([]))?;
    if genesis_hash.trim().is_empty() {
        return Err(anyhow!("validator getGenesisHash returned an empty result"));
    }
    Ok(genesis_hash)
}

pub fn fetch_first_available_block(config: &ExplorerBackendConfig) -> Result<u64> {
    rpc_request(config, "getFirstAvailableBlock", json!([]))
        .context("reading validator first available block")
}

pub fn fetch_finalized_blockhash(
    config: &ExplorerBackendConfig,
    slot: u64,
) -> Result<Option<String>> {
    let block: Option<Value> = rpc_request(
        config,
        "getBlock",
        json!([
            slot,
            {
                "commitment": "finalized",
                "encoding": "json",
                "transactionDetails": "none",
                "rewards": false,
                "maxSupportedTransactionVersion": 0
            }
        ]),
    )?;
    let Some(block) = block else {
        return Ok(None);
    };
    let blockhash = block
        .get("blockhash")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("validator getBlock({slot}) returned no blockhash"))?;
    Ok(Some(blockhash.to_string()))
}

fn rpc_request<T: DeserializeOwned>(
    config: &ExplorerBackendConfig,
    method: &str,
    params: Value,
) -> Result<T> {
    let client = Client::builder()
        .timeout(config.rpc_timeout)
        .build()
        .context("building Explorer chain-identity RPC client")?;
    let response = client
        .post(&config.rpc_url)
        .json(&json!({
            "jsonrpc": "2.0",
            "id": 1u64,
            "method": method,
            "params": params,
        }))
        .send()
        .with_context(|| format!("requesting validator {method}"))?
        .error_for_status()
        .with_context(|| format!("validator {method} RPC returned HTTP error"))?;
    let envelope: JsonRpcEnvelope<T> = response
        .json()
        .with_context(|| format!("decoding validator {method} RPC response"))?;
    if let Some(error) = envelope.error {
        return Err(anyhow!(
            "validator {method} failed with {}: {}",
            error.code,
            error.message
        ));
    }
    envelope
        .result
        .ok_or_else(|| anyhow!("validator {method} returned no result"))
}
