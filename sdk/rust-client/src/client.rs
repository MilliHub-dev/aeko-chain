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

    pub async fn get_wallet_permission_account(
        &self,
        pubkey: &str,
    ) -> AekoRustSdkResult<WalletPermissionAccount> {
        let account = self
            .get_account_info(pubkey)
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
        let account = self
            .get_account_info(pubkey)
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
        let account = self
            .get_account_info(pubkey)
            .await?
            .ok_or(AekoRustSdkError::DecodeAccount {
                label: "AEKO-721 collection",
            })?;
        ensure_owner(&account, &default_token_721_program_id(), "AEKO-721 collection")?;
        decode_account(&account, "AEKO-721 collection")
    }

    pub async fn get_token_721_token(
        &self,
        pubkey: &str,
    ) -> AekoRustSdkResult<Aeko721Token> {
        let account = self
            .get_account_info(pubkey)
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
