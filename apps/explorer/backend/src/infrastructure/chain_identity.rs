use {
    crate::config::ExplorerBackendConfig,
    anyhow::{anyhow, Context, Result},
    reqwest::blocking::Client,
    serde::Deserialize,
    serde_json::json,
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
    let client = Client::builder()
        .timeout(config.rpc_timeout)
        .build()
        .context("building Explorer chain-identity RPC client")?;
    let response = client
        .post(&config.rpc_url)
        .json(&json!({
            "jsonrpc": "2.0",
            "id": 1u64,
            "method": "getGenesisHash",
            "params": [],
        }))
        .send()
        .context("requesting validator genesis hash")?
        .error_for_status()
        .context("validator genesis-hash RPC returned HTTP error")?;
    let envelope: JsonRpcEnvelope<String> = response
        .json()
        .context("decoding validator genesis-hash RPC response")?;
    if let Some(error) = envelope.error {
        return Err(anyhow!(
            "validator getGenesisHash failed with {}: {}",
            error.code,
            error.message
        ));
    }
    let genesis_hash = envelope
        .result
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("validator getGenesisHash returned no usable result"))?;
    Ok(genesis_hash)
}
