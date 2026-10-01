use {
    crate::{
        builders::{
            default_token_721_program_id, default_wallet_permissions_program_id, Aeko721Collection,
            Aeko721Token, WalletPermissionAccount, WalletPermissionAuditLogAccount,
        },
        error::{AekoRustSdkError, AekoRustSdkResult},
    },
    base64::{engine::general_purpose::STANDARD as BASE64, Engine},
    borsh::BorshDeserialize,
    reqwest::Client,
    serde::de::DeserializeOwned,
    serde::Deserialize,
    serde_json::{json, Value},
};

#[derive(Clone, Debug, Deserialize)]
pub struct AccountInfoValue {
    pub data: Value,
    pub executable: bool,
    pub lamports: u64,
    pub owner: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ProgramAccount {
    pub pubkey: String,
    pub account: AccountInfoValue,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SignatureStatus {
    pub slot: u64,
    pub confirmations: Option<u64>,
    pub err: Option<Value>,
    #[serde(rename = "confirmationStatus")]
    pub confirmation_status: Option<String>,
}

pub struct AekoDeveloperClient {
    http: Client,
    endpoint: String,
}

impl AekoDeveloperClient {
    pub fn new(url: String) -> Self {
        Self {
            http: Client::new(),
            endpoint: url,
        }
    }

    pub async fn get_latest_blockhash(&self) -> AekoRustSdkResult<String> {
        let value: RpcValueResponse<LatestBlockhashValue> =
            self.rpc("getLatestBlockhash", json!([])).await?;
        Ok(value.value.blockhash)
    }

    pub async fn get_balance(&self, pubkey: &str) -> AekoRustSdkResult<u64> {
        let value: RpcValueResponse<u64> = self.rpc("getBalance", json!([pubkey])).await?;
        Ok(value.value)
    }

    pub async fn get_account_info(
        &self,
        pubkey: &str,
    ) -> AekoRustSdkResult<Option<AccountInfoValue>> {
        let value: RpcValueResponse<Option<AccountInfoValue>> = self
            .rpc("getAccountInfo", json!([pubkey, {"encoding": "base64"}]))
            .await?;
        Ok(value.value)
    }

    pub async fn get_program_accounts(
        &self,
        program_id: &str,
    ) -> AekoRustSdkResult<Vec<ProgramAccount>> {
        self.rpc(
            "getProgramAccounts",
            json!([program_id, {"encoding": "base64"}]),
        )
        .await
    }

    pub async fn get_signature_statuses(
        &self,
        signatures: &[String],
    ) -> AekoRustSdkResult<Vec<Option<SignatureStatus>>> {
        let value: RpcValueResponse<Vec<Option<SignatureStatus>>> = self
            .rpc("getSignatureStatuses", json!([signatures]))
            .await?;
        Ok(value.value)
    }

    pub async fn send_transaction_base64(
        &self,
        signed_transaction_base64: &str,
    ) -> AekoRustSdkResult<String> {
        self.rpc(
            "sendTransaction",
            json!([signed_transaction_base64, {"encoding": "base64"}]),
        )
        .await
    }

    /// Instant developer airdrop: no admin approval, dispatched immediately
    /// subject only to faucet caps.
    pub async fn request_airdrop(&self, pubkey: &str, lamports: u64) -> AekoRustSdkResult<String> {
        self.rpc("requestAirdrop", json!([pubkey, lamports, {}]))
            .await
    }

    pub async fn request_airdrop_with_blockhash(
        &self,
        pubkey: &str,
        lamports: u64,
        recent_blockhash: &str,
    ) -> AekoRustSdkResult<String> {
        self.rpc(
            "requestAirdrop",
            json!([pubkey, lamports, {"recentBlockhash": recent_blockhash}]),
        )
        .await
    }

    /// Protected Funding transfer via direct RPC. Requires the server-only
    /// funding authorization credential when the validator configures one.
    /// Public clients should use the Explorer `/funding/request` queue with
    /// polling instead; trusted settlement code uses this.
    pub async fn request_funding_transfer(
        &self,
        pubkey: &str,
        lamports: u64,
        funding_authorization: Option<&str>,
        recent_blockhash: Option<&str>,
    ) -> AekoRustSdkResult<String> {
        self.rpc(
            "requestFunding",
            json!([pubkey, lamports, {
                "fundingAuthorization": funding_authorization,
                "recentBlockhash": recent_blockhash,
            }]),
        )
        .await
    }

    #[deprecated(note = "use request_funding_transfer")]
    pub async fn request_grant(
        &self,
        pubkey: &str,
        lamports: u64,
        funding_authorization: Option<&str>,
        recent_blockhash: Option<&str>,
    ) -> AekoRustSdkResult<String> {
        self.request_funding_transfer(pubkey, lamports, funding_authorization, recent_blockhash)
            .await
    }

    /// Public funding request via the Explorer approval queue. Submits
    /// `POST {explorer}/funding/request` then polls until confirmed,
    /// failed/rejected, or timeout. Returns `(request_id, signature)`.
    pub async fn request_funding(
        &self,
        explorer_api_url: &str,
        address: &str,
        timeout_secs: u64,
        poll_interval_secs: u64,
    ) -> AekoRustSdkResult<(String, String)> {
        let base = explorer_api_url.trim_end_matches('/');
        let response = self
            .http
            .post(format!("{base}/funding/request"))
            .json(&json!({"address": address}))
            .send()
            .await
            .map_err(|e| AekoRustSdkError::Rpc(format!("funding request failed: {e}")))?;
        let request_id = if response.status().is_success() {
            let created: serde_json::Value = response.json().await.map_err(|e| {
                AekoRustSdkError::Rpc(format!("funding request decode failed: {e}"))
            })?;
            created
                .pointer("/data/id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AekoRustSdkError::Rpc(
                        "funding request succeeded but returned no request id".to_string(),
                    )
                })?
                .to_string()
        } else {
            // The wallet already has an in-flight request: adopt it and poll
            // it instead of dead-ending on REQUEST_PENDING.
            let failure: serde_json::Value = response.json().await.map_err(|e| {
                AekoRustSdkError::Rpc(format!("funding request decode failed: {e}"))
            })?;
            let pending =
                failure.pointer("/error/code").and_then(|v| v.as_str()) == Some("REQUEST_PENDING");
            let adopted = failure
                .pointer("/error/requestId")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(ToString::to_string);
            match (pending, adopted) {
                (true, Some(id)) => id,
                _ => {
                    let message = failure
                        .pointer("/error/message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("funding request failed");
                    return Err(AekoRustSdkError::Rpc(message.to_string()));
                }
            }
        };

        let deadline =
            std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs.max(1));
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(poll_interval_secs.max(1))).await;
            let status: serde_json::Value = self
                .http
                .get(format!("{base}/funding/request/{request_id}"))
                .send()
                .await
                .map_err(|e| AekoRustSdkError::Rpc(format!("funding status poll failed: {e}")))?
                .json()
                .await
                .map_err(|e| AekoRustSdkError::Rpc(format!("funding status decode failed: {e}")))?;
            let state = status
                .pointer("/data/status")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            match state {
                "confirmed" => {
                    let signature = status
                        .pointer("/data/signature")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    return Ok((request_id, signature));
                }
                "rejected" | "failed" => {
                    return Err(AekoRustSdkError::Rpc(format!(
                        "funding request {request_id} ended with status {state}"
                    )))
                }
                _ => {
                    if std::time::Instant::now() >= deadline {
                        return Err(AekoRustSdkError::Rpc(format!(
                            "timed out waiting for admin approval of {request_id} (last status: {state})"
                        )));
                    }
                }
            }
        }
    }

    /// Direct Admin Funding via the Explorer API (bypasses a second approval).
    pub async fn send_funding(
        &self,
        explorer_api_url: &str,
        address: &str,
        amount_aeko: f64,
        admin_token: &str,
    ) -> AekoRustSdkResult<serde_json::Value> {
        let base = explorer_api_url.trim_end_matches('/');
        self.http
            .post(format!("{base}/admin/funding/send"))
            .header("x-aeko-settings-token", admin_token)
            .json(&json!({"address": address, "amountAeko": amount_aeko}))
            .send()
            .await
            .map_err(|e| AekoRustSdkError::Rpc(format!("direct funding failed: {e}")))?
            .json()
            .await
            .map_err(|e| AekoRustSdkError::Rpc(format!("direct funding decode failed: {e}")))
    }

    #[deprecated(note = "use send_funding")]
    pub async fn create_grant(
        &self,
        explorer_api_url: &str,
        address: &str,
        amount_aeko: f64,
        admin_token: &str,
    ) -> AekoRustSdkResult<serde_json::Value> {
        self.send_funding(explorer_api_url, address, amount_aeko, admin_token)
            .await
    }

    pub async fn get_wallet_permission_account(
        &self,
        pubkey: &str,
    ) -> AekoRustSdkResult<WalletPermissionAccount> {
        let account =
            self.get_account_info(pubkey)
                .await?
                .ok_or(AekoRustSdkError::DecodeAccount {
                    label: "wallet permission state",
                })?;
        ensure_owner(
            &account,
            &default_wallet_permissions_program_id(),
            "wallet permission state",
        )?;
        decode_account(&account, "wallet permission state")
    }

    pub async fn get_wallet_permission_audit_log(
        &self,
        pubkey: &str,
    ) -> AekoRustSdkResult<WalletPermissionAuditLogAccount> {
        let account =
            self.get_account_info(pubkey)
                .await?
                .ok_or(AekoRustSdkError::DecodeAccount {
                    label: "wallet permission audit log",
                })?;
        ensure_owner(
            &account,
            &default_wallet_permissions_program_id(),
            "wallet permission audit log",
        )?;
        decode_account(&account, "wallet permission audit log")
    }

    pub async fn get_token_721_collection(
        &self,
        pubkey: &str,
    ) -> AekoRustSdkResult<Aeko721Collection> {
        let account =
            self.get_account_info(pubkey)
                .await?
                .ok_or(AekoRustSdkError::DecodeAccount {
                    label: "AEKO-721 collection",
                })?;
        ensure_owner(
            &account,
            &default_token_721_program_id(),
            "AEKO-721 collection",
        )?;
        decode_account(&account, "AEKO-721 collection")
    }

    pub async fn get_token_721_token(&self, pubkey: &str) -> AekoRustSdkResult<Aeko721Token> {
        let account =
            self.get_account_info(pubkey)
                .await?
                .ok_or(AekoRustSdkError::DecodeAccount {
                    label: "AEKO-721 token",
                })?;
        ensure_owner(&account, &default_token_721_program_id(), "AEKO-721 token")?;
        decode_account(&account, "AEKO-721 token")
    }

    async fn rpc<T: DeserializeOwned>(&self, method: &str, params: Value) -> AekoRustSdkResult<T> {
        let response: JsonRpcEnvelope<T> = self
            .http
            .post(&self.endpoint)
            .json(&json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params,
            }))
            .send()
            .await?
            .json()
            .await?;

        match (response.result, response.error) {
            (Some(result), None) => Ok(result),
            (_, Some(error)) => Err(AekoRustSdkError::Rpc(error.message)),
            _ => Err(AekoRustSdkError::Rpc("missing JSON-RPC result".to_string())),
        }
    }
}

fn ensure_owner(
    account: &AccountInfoValue,
    expected_owner: &str,
    label: &'static str,
) -> AekoRustSdkResult<()> {
    if account.owner != expected_owner {
        return Err(AekoRustSdkError::InvalidAccountOwner {
            label,
            expected: expected_owner.to_string(),
            found: account.owner.clone(),
        });
    }
    Ok(())
}

fn decode_account<T: BorshDeserialize>(
    account: &AccountInfoValue,
    label: &'static str,
) -> AekoRustSdkResult<T> {
    let data = match &account.data {
        Value::Array(values) if !values.is_empty() => values[0]
            .as_str()
            .ok_or(AekoRustSdkError::DecodeAccount { label })?,
        Value::String(value) => value.as_str(),
        _ => return Err(AekoRustSdkError::DecodeAccount { label }),
    };
    let bytes = BASE64
        .decode(data)
        .map_err(|_| AekoRustSdkError::DecodeAccount { label })?;
    let mut slice = bytes.as_slice();
    T::deserialize(&mut slice).map_err(|_| AekoRustSdkError::DecodeAccount { label })
}

#[derive(Debug, Deserialize)]
struct JsonRpcEnvelope<T> {
    result: Option<T>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct RpcValueResponse<T> {
    value: T,
}

#[derive(Debug, Deserialize)]
struct LatestBlockhashValue {
    blockhash: String,
}
