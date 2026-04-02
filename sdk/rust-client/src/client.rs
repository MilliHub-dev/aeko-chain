use {
    crate::error::{AekoRustSdkError, AekoRustSdkResult},
    aeko_rpc_client::nonblocking::rpc_client::RpcClient,
    aeko_sdk::{
        account::Account,
        commitment_config::CommitmentConfig,
        hash::Hash,
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Signature,
        signers::Signers,
        transaction::Transaction,
    },
    aeko_token_721_program::state::{Aeko721Collection, Aeko721Token},
    aeko_wallet_permissions_program::state::{
        WalletPermissionAccount, WalletPermissionAuditLogAccount,
    },
    std::sync::Arc,
};

pub struct AekoDeveloperClient {
    rpc: Arc<RpcClient>,
}

impl AekoDeveloperClient {
    pub fn new(url: String) -> Self {
        Self {
            rpc: Arc::new(RpcClient::new(url)),
        }
    }

    pub fn new_with_commitment(url: String, commitment: CommitmentConfig) -> Self {
        Self {
            rpc: Arc::new(RpcClient::new_with_commitment(url, commitment)),
        }
    }

    pub fn from_rpc_client(rpc: RpcClient) -> Self {
        Self { rpc: Arc::new(rpc) }
    }

    pub fn rpc(&self) -> &RpcClient {
        self.rpc.as_ref()
    }

    pub async fn get_latest_blockhash(&self) -> AekoRustSdkResult<Hash> {
        Ok(self.rpc.get_latest_blockhash().await?)
    }

    pub async fn get_balance(&self, pubkey: &Pubkey) -> AekoRustSdkResult<u64> {
        Ok(self.rpc.get_balance(pubkey).await?)
    }

    pub async fn get_account(&self, pubkey: &Pubkey) -> AekoRustSdkResult<Account> {
        Ok(self.rpc.get_account(pubkey).await?)
    }

    pub async fn send_transaction(&self, transaction: &Transaction) -> AekoRustSdkResult<Signature> {
        Ok(self.rpc.send_transaction(transaction).await?)
    }

    pub async fn send_and_confirm_transaction(
        &self,
        transaction: &Transaction,
    ) -> AekoRustSdkResult<Signature> {
        Ok(self.rpc.send_and_confirm_transaction(transaction).await?)
    }

    pub async fn sign_and_send_transaction<T: Signers + ?Sized>(
        &self,
        payer: Option<&Pubkey>,
        instructions: Vec<Instruction>,
        signers: &T,
    ) -> AekoRustSdkResult<Signature> {
        let recent_blockhash = self.get_latest_blockhash().await?;
        let transaction =
            Transaction::new_signed_with_payer(&instructions, payer, signers, recent_blockhash);
        self.send_and_confirm_transaction(&transaction).await
    }

    pub async fn get_wallet_permission_account(
        &self,
        pubkey: &Pubkey,
    ) -> AekoRustSdkResult<WalletPermissionAccount> {
        let account = self.get_account(pubkey).await?;
        ensure_owner(
            &account,
            &aeko_wallet_permissions_program::id(),
            "wallet permission state",
        )?;
        WalletPermissionAccount::deserialize_padded(&account.data)
            .map_err(|_| AekoRustSdkError::DecodeAccount {
                label: "wallet permission state",
            })
    }

    pub async fn get_wallet_permission_audit_log(
        &self,
        pubkey: &Pubkey,
    ) -> AekoRustSdkResult<WalletPermissionAuditLogAccount> {
        let account = self.get_account(pubkey).await?;
        ensure_owner(
            &account,
            &aeko_wallet_permissions_program::id(),
            "wallet permission audit log",
        )?;
        WalletPermissionAuditLogAccount::deserialize_padded(&account.data).map_err(|_| {
            AekoRustSdkError::DecodeAccount {
                label: "wallet permission audit log",
            }
        })
    }

    pub async fn get_token_721_collection(
        &self,
        pubkey: &Pubkey,
    ) -> AekoRustSdkResult<Aeko721Collection> {
        let account = self.get_account(pubkey).await?;
        ensure_owner(&account, &aeko_token_721_program::id(), "AEKO-721 collection")?;
        Aeko721Collection::deserialize_padded(&account.data).map_err(|_| {
            AekoRustSdkError::DecodeAccount {
                label: "AEKO-721 collection",
            }
        })
    }

    pub async fn get_token_721_token(
        &self,
        pubkey: &Pubkey,
    ) -> AekoRustSdkResult<Aeko721Token> {
        let account = self.get_account(pubkey).await?;
        ensure_owner(&account, &aeko_token_721_program::id(), "AEKO-721 token")?;
        Aeko721Token::deserialize_padded(&account.data).map_err(|_| AekoRustSdkError::DecodeAccount {
            label: "AEKO-721 token",
        })
    }
}

fn ensure_owner(
    account: &Account,
    expected_owner: &Pubkey,
    label: &'static str,
) -> AekoRustSdkResult<()> {
    if &account.owner != expected_owner {
        return Err(AekoRustSdkError::InvalidAccountOwner {
            label,
            expected: *expected_owner,
            found: account.owner,
        });
    }
    Ok(())
}
