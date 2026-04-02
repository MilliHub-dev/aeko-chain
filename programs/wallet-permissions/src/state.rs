use {
    crate::error::WalletPermissionsError,
    borsh::{BorshDeserialize, BorshSerialize},
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
};

pub const MAX_DELEGATES: usize = 128;
pub const MAX_AUDIT_ENTRIES: usize = 1024;
pub const MAX_USAGE_WINDOWS: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum PermissionRole {
    Owner,
    Spender,
    Viewer,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum PermissionStatus {
    Active,
    Revoked,
    Expired,
    Frozen,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum ProgramPolicyMode {
    DenyByDefault,
    AllowByDefault,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum AuditEventType {
    PermissionGranted,
    PermissionUpdated,
    PermissionRevoked,
    SpendLimitUpdated,
    ProgramAllowlistUpdated,
    WalletFrozen,
    WalletUnfrozen,
    DelegateUsageRecorded,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct TokenSpendCap {
    pub mint: Pubkey,
    pub max_single_tx: Option<u64>,
    pub max_daily: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SpendLimitPolicy {
    pub max_single_tx_aeko: Option<u64>,
    pub max_daily_aeko: Option<u64>,
    pub token_caps: Vec<TokenSpendCap>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct DelegatePermission {
    pub delegate: Pubkey,
    pub role: PermissionRole,
    pub label: Option<String>,
    pub status: PermissionStatus,
    pub valid_from_epoch: u64,
    pub valid_until_epoch: Option<u64>,
    pub spend_limit: SpendLimitPolicy,
    pub program_allowlist: Vec<Pubkey>,
    pub token_allowlist: Vec<Pubkey>,
    pub app_scope_hashes: Vec<[u8; 32]>,
    pub requires_reauth: bool,
    pub last_used_epoch: Option<u64>,
    pub last_used_slot: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct TokenSpendCounter {
    pub mint: Pubkey,
    pub amount: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct DelegateUsageWindow {
    pub delegate: Pubkey,
    pub day_index: u64,
    pub aeko_spent_today: u64,
    pub token_spent_today: Vec<TokenSpendCounter>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct EffectivePermissionView {
    pub wallet: Pubkey,
    pub delegate: Pubkey,
    pub wallet_frozen: bool,
    pub status: Option<PermissionStatus>,
    pub role: Option<PermissionRole>,
    pub active: bool,
    pub requires_reauth: bool,
    pub valid_until_epoch: Option<u64>,
    pub max_single_tx_aeko: Option<u64>,
    pub max_daily_aeko: Option<u64>,
    pub allowed_programs: Vec<Pubkey>,
    pub allowed_tokens: Vec<Pubkey>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct AuditEventSummary {
    pub role: Option<PermissionRole>,
    pub status: Option<PermissionStatus>,
    pub affected_programs: Vec<Pubkey>,
    pub affected_mints: Vec<Pubkey>,
    pub valid_until_epoch: Option<u64>,
    pub amount_hint: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct WalletPermissionAuditLogEntry {
    pub wallet: Pubkey,
    pub sequence: u64,
    pub actor: Pubkey,
    pub target_delegate: Option<Pubkey>,
    pub event_type: AuditEventType,
    pub event_summary: AuditEventSummary,
    pub created_at_epoch: u64,
    pub created_at_slot: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct WalletPermissionAuditLogAccount {
    pub wallet: Pubkey,
    pub next_sequence: u64,
    pub entries: Vec<WalletPermissionAuditLogEntry>,
    pub is_initialized: bool,
}

impl WalletPermissionAuditLogAccount {
    pub fn new(wallet: Pubkey) -> Self {
        Self {
            wallet,
            next_sequence: 0,
            entries: Vec::new(),
            is_initialized: true,
        }
    }

    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn append(
        &mut self,
        actor: Pubkey,
        target_delegate: Option<Pubkey>,
        event_type: AuditEventType,
        event_summary: AuditEventSummary,
        created_at_epoch: u64,
        created_at_slot: u64,
    ) -> Result<(), ProgramError> {
        if self.entries.len() >= MAX_AUDIT_ENTRIES {
            return Err(WalletPermissionsError::AuditLogFull.into());
        }

        self.entries.push(WalletPermissionAuditLogEntry {
            wallet: self.wallet,
            sequence: self.next_sequence,
            actor,
            target_delegate,
            event_type,
            event_summary,
            created_at_epoch,
            created_at_slot,
        });
        self.next_sequence = self.next_sequence.saturating_add(1);
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct WalletPermissionAccount {
    pub wallet: Pubkey,
    pub did: String,
    pub version: u8,
    pub policy_nonce: u64,
    pub is_frozen: bool,
    pub freeze_reason_code: Option<u16>,
    pub reauth_required_until_epoch: Option<u64>,
    pub owner: Pubkey,
    pub delegates: Vec<DelegatePermission>,
    pub usage_windows: Vec<DelegateUsageWindow>,
    pub default_program_policy: ProgramPolicyMode,
    pub created_at_epoch: u64,
    pub updated_at_epoch: u64,
    pub is_initialized: bool,
}

impl WalletPermissionAccount {
    pub fn new(
        wallet: Pubkey,
        did: String,
        owner: Pubkey,
        default_program_policy: ProgramPolicyMode,
        current_epoch: u64,
    ) -> Self {
        Self {
            wallet,
            did,
            version: 1,
            policy_nonce: 0,
            is_frozen: false,
            freeze_reason_code: None,
            reauth_required_until_epoch: None,
            owner,
            delegates: Vec::new(),
            usage_windows: Vec::new(),
            default_program_policy,
            created_at_epoch: current_epoch,
            updated_at_epoch: current_epoch,
            is_initialized: true,
        }
    }

    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn ensure_owner(&self, signer: &Pubkey) -> Result<(), ProgramError> {
        if &self.owner != signer {
            return Err(WalletPermissionsError::InvalidOwner.into());
        }
        Ok(())
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if !self.is_initialized {
            return Err(WalletPermissionsError::UninitializedState.into());
        }
        Ok(())
    }

    pub fn grant_delegate(
        &mut self,
        delegate: DelegatePermission,
        current_epoch: u64,
    ) -> Result<(), ProgramError> {
        if self.is_frozen {
            return Err(WalletPermissionsError::WalletFrozen.into());
        }
        if let Some(valid_until_epoch) = delegate.valid_until_epoch {
            if valid_until_epoch < delegate.valid_from_epoch {
                return Err(WalletPermissionsError::InvalidDelegateWindow.into());
            }
        }
        if let Some(existing) = self
            .delegates
            .iter_mut()
            .find(|existing| existing.delegate == delegate.delegate)
        {
            *existing = delegate;
        } else {
            if self.delegates.len() >= MAX_DELEGATES {
                return Err(ProgramError::AccountDataTooSmall);
            }
            self.delegates.push(delegate);
        }
        self.policy_nonce = self.policy_nonce.saturating_add(1);
        self.updated_at_epoch = current_epoch;
        Ok(())
    }

    pub fn revoke_delegate(
        &mut self,
        delegate: Pubkey,
        current_epoch: u64,
    ) -> Result<DelegatePermission, ProgramError> {
        if self.is_frozen {
            return Err(WalletPermissionsError::WalletFrozen.into());
        }
        let delegate_permission = self
            .delegates
            .iter_mut()
            .find(|permission| permission.delegate == delegate)
            .ok_or::<ProgramError>(WalletPermissionsError::DelegateNotFound.into())?;
        delegate_permission.status = PermissionStatus::Revoked;
        delegate_permission.valid_until_epoch = Some(current_epoch);
        self.policy_nonce = self.policy_nonce.saturating_add(1);
        self.updated_at_epoch = current_epoch;
        Ok(delegate_permission.clone())
    }

    pub fn update_delegate(
        &mut self,
        delegate: Pubkey,
        role: Option<PermissionRole>,
        label: Option<Option<String>>,
        valid_until_epoch: Option<Option<u64>>,
        spend_limit: Option<SpendLimitPolicy>,
        program_allowlist: Option<Vec<Pubkey>>,
        token_allowlist: Option<Vec<Pubkey>>,
        app_scope_hashes: Option<Vec<[u8; 32]>>,
        requires_reauth: Option<bool>,
        current_epoch: u64,
    ) -> Result<DelegatePermission, ProgramError> {
        if self.is_frozen {
            return Err(WalletPermissionsError::WalletFrozen.into());
        }
        let delegate_permission = self
            .delegates
            .iter_mut()
            .find(|permission| permission.delegate == delegate)
            .ok_or::<ProgramError>(WalletPermissionsError::DelegateNotFound.into())?;

        if let Some(role) = role {
            delegate_permission.role = role;
        }
        if let Some(label) = label {
            delegate_permission.label = label;
        }
        if let Some(valid_until_epoch) = valid_until_epoch {
            if let Some(until_epoch) = valid_until_epoch {
                if until_epoch < delegate_permission.valid_from_epoch {
                    return Err(WalletPermissionsError::InvalidDelegateWindow.into());
                }
            }
            delegate_permission.valid_until_epoch = valid_until_epoch;
        }
        if let Some(spend_limit) = spend_limit {
            delegate_permission.spend_limit = spend_limit;
        }
        if let Some(program_allowlist) = program_allowlist {
            delegate_permission.program_allowlist = program_allowlist;
        }
        if let Some(token_allowlist) = token_allowlist {
            delegate_permission.token_allowlist = token_allowlist;
        }
        if let Some(app_scope_hashes) = app_scope_hashes {
            delegate_permission.app_scope_hashes = app_scope_hashes;
        }
        if let Some(requires_reauth) = requires_reauth {
            delegate_permission.requires_reauth = requires_reauth;
        }

        self.policy_nonce = self.policy_nonce.saturating_add(1);
        self.updated_at_epoch = current_epoch;
        Ok(delegate_permission.clone())
    }

    pub fn effective_permissions(
        &self,
        delegate: Pubkey,
        current_epoch: u64,
    ) -> EffectivePermissionView {
        let delegate_permission = self.delegates.iter().find(|entry| entry.delegate == delegate);
        let active = if self.is_frozen {
            false
        } else if let Some(delegate_permission) = delegate_permission {
            delegate_permission.status == PermissionStatus::Active
                && current_epoch >= delegate_permission.valid_from_epoch
                && delegate_permission
                    .valid_until_epoch
                    .map(|valid_until_epoch| current_epoch <= valid_until_epoch)
                    .unwrap_or(true)
        } else {
            false
        };

        EffectivePermissionView {
            wallet: self.wallet,
            delegate,
            wallet_frozen: self.is_frozen,
            status: delegate_permission.map(|permission| {
                if permission.status == PermissionStatus::Active
                    && permission
                        .valid_until_epoch
                        .map(|valid_until_epoch| current_epoch > valid_until_epoch)
                        .unwrap_or(false)
                {
                    PermissionStatus::Expired
                } else {
                    permission.status
                }
            }),
            role: delegate_permission.map(|permission| permission.role),
            active,
            requires_reauth: delegate_permission
                .map(|permission| permission.requires_reauth)
                .unwrap_or(false),
            valid_until_epoch: delegate_permission.and_then(|permission| permission.valid_until_epoch),
            max_single_tx_aeko: delegate_permission
                .and_then(|permission| permission.spend_limit.max_single_tx_aeko),
            max_daily_aeko: delegate_permission
                .and_then(|permission| permission.spend_limit.max_daily_aeko),
            allowed_programs: delegate_permission
                .map(|permission| permission.program_allowlist.clone())
                .unwrap_or_default(),
            allowed_tokens: delegate_permission
                .map(|permission| permission.token_allowlist.clone())
                .unwrap_or_default(),
        }
    }

    pub fn record_usage(
        &mut self,
        delegate: Pubkey,
        target_program: Option<Pubkey>,
        mint: Option<Pubkey>,
        amount: u64,
        day_index: u64,
        current_epoch: u64,
        current_slot: u64,
    ) -> Result<DelegatePermission, ProgramError> {
        if self.is_frozen {
            return Err(WalletPermissionsError::WalletFrozen.into());
        }
        let delegate_permission = self
            .delegates
            .iter_mut()
            .find(|permission| permission.delegate == delegate)
            .ok_or::<ProgramError>(WalletPermissionsError::DelegateNotFound.into())?;

        if delegate_permission.status != PermissionStatus::Active
            || current_epoch < delegate_permission.valid_from_epoch
            || delegate_permission
                .valid_until_epoch
                .map(|valid_until_epoch| current_epoch > valid_until_epoch)
                .unwrap_or(false)
        {
            return Err(WalletPermissionsError::DelegateInactive.into());
        }

        if let Some(target_program) = target_program {
            let allowed = if delegate_permission.program_allowlist.is_empty() {
                self.default_program_policy == ProgramPolicyMode::AllowByDefault
            } else {
                delegate_permission.program_allowlist.contains(&target_program)
            };
            if !allowed {
                return Err(WalletPermissionsError::ProgramNotAllowed.into());
            }
        }

        if let Some(mint) = mint {
            if !delegate_permission.token_allowlist.is_empty()
                && !delegate_permission.token_allowlist.contains(&mint)
            {
                return Err(WalletPermissionsError::TokenNotAllowed.into());
            }
            if let Some(cap) = delegate_permission
                .spend_limit
                .token_caps
                .iter()
                .find(|cap| cap.mint == mint)
            {
                if cap.max_single_tx.map(|max| amount > max).unwrap_or(false) {
                    return Err(WalletPermissionsError::SpendLimitExceeded.into());
                }
            }
        } else if delegate_permission
            .spend_limit
            .max_single_tx_aeko
            .map(|max| amount > max)
            .unwrap_or(false)
        {
            return Err(WalletPermissionsError::SpendLimitExceeded.into());
        }

        let usage_window = if let Some(existing) = self
            .usage_windows
            .iter_mut()
            .find(|window| window.delegate == delegate && window.day_index == day_index)
        {
            existing
        } else {
            if self.usage_windows.len() >= MAX_USAGE_WINDOWS {
                self.usage_windows.remove(0);
            }
            self.usage_windows.push(DelegateUsageWindow {
                delegate,
                day_index,
                aeko_spent_today: 0,
                token_spent_today: Vec::new(),
            });
            self.usage_windows
                .last_mut()
                .ok_or::<ProgramError>(ProgramError::AccountDataTooSmall)?
        };

        if let Some(mint) = mint {
            let token_counter = if let Some(counter) = usage_window
                .token_spent_today
                .iter_mut()
                .find(|counter| counter.mint == mint)
            {
                counter
            } else {
                usage_window
                    .token_spent_today
                    .push(TokenSpendCounter { mint, amount: 0 });
                usage_window
                    .token_spent_today
                    .last_mut()
                    .ok_or::<ProgramError>(ProgramError::AccountDataTooSmall)?
            };

            let new_total = token_counter.amount.saturating_add(amount);
            if let Some(cap) = delegate_permission
                .spend_limit
                .token_caps
                .iter()
                .find(|cap| cap.mint == mint)
            {
                if cap.max_daily.map(|max| new_total > max).unwrap_or(false) {
                    return Err(WalletPermissionsError::SpendLimitExceeded.into());
                }
            }
            token_counter.amount = new_total;
        } else {
            let new_total = usage_window.aeko_spent_today.saturating_add(amount);
            if delegate_permission
                .spend_limit
                .max_daily_aeko
                .map(|max| new_total > max)
                .unwrap_or(false)
            {
                return Err(WalletPermissionsError::SpendLimitExceeded.into());
            }
            usage_window.aeko_spent_today = new_total;
        }

        delegate_permission.last_used_epoch = Some(current_epoch);
        delegate_permission.last_used_slot = Some(current_slot);
        self.updated_at_epoch = current_epoch;
        Ok(delegate_permission.clone())
    }

    pub fn freeze(
        &mut self,
        reason_code: Option<u16>,
        reauth_required_until_epoch: Option<u64>,
        current_epoch: u64,
    ) {
        self.is_frozen = true;
        self.freeze_reason_code = reason_code;
        self.reauth_required_until_epoch = reauth_required_until_epoch;
        self.policy_nonce = self.policy_nonce.saturating_add(1);
        self.updated_at_epoch = current_epoch;
    }

    pub fn unfreeze(&mut self, current_epoch: u64) {
        self.is_frozen = false;
        self.freeze_reason_code = None;
        self.reauth_required_until_epoch = None;
        self.policy_nonce = self.policy_nonce.saturating_add(1);
        self.updated_at_epoch = current_epoch;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_delegate(delegate: Pubkey) -> DelegatePermission {
        DelegatePermission {
            delegate,
            role: PermissionRole::Spender,
            label: Some("session".to_string()),
            status: PermissionStatus::Active,
            valid_from_epoch: 1,
            valid_until_epoch: Some(10),
            spend_limit: SpendLimitPolicy {
                max_single_tx_aeko: Some(100),
                max_daily_aeko: Some(500),
                token_caps: Vec::new(),
            },
            program_allowlist: Vec::new(),
            token_allowlist: Vec::new(),
            app_scope_hashes: Vec::new(),
            requires_reauth: false,
            last_used_epoch: None,
            last_used_slot: None,
        }
    }

    #[test]
    fn grant_and_revoke_delegate_updates_policy_nonce() {
        let owner = Pubkey::new_unique();
        let delegate = Pubkey::new_unique();
        let mut account = WalletPermissionAccount::new(
            owner,
            format!("did:aeko:{owner}"),
            owner,
            ProgramPolicyMode::DenyByDefault,
            0,
        );

        account.grant_delegate(sample_delegate(delegate), 1).unwrap();
        assert_eq!(account.policy_nonce, 1);
        assert_eq!(account.delegates.len(), 1);

        let revoked = account.revoke_delegate(delegate, 2).unwrap();
        assert_eq!(account.policy_nonce, 2);
        assert_eq!(revoked.status, PermissionStatus::Revoked);
    }

    #[test]
    fn freeze_and_unfreeze_updates_state() {
        let owner = Pubkey::new_unique();
        let mut account = WalletPermissionAccount::new(
            owner,
            format!("did:aeko:{owner}"),
            owner,
            ProgramPolicyMode::DenyByDefault,
            0,
        );

        account.freeze(Some(7), Some(9), 1);
        assert!(account.is_frozen);
        assert_eq!(account.freeze_reason_code, Some(7));

        account.unfreeze(2);
        assert!(!account.is_frozen);
        assert_eq!(account.freeze_reason_code, None);
    }

    #[test]
    fn update_delegate_changes_policy_fields() {
        let owner = Pubkey::new_unique();
        let delegate = Pubkey::new_unique();
        let mut account = WalletPermissionAccount::new(
            owner,
            format!("did:aeko:{owner}"),
            owner,
            ProgramPolicyMode::DenyByDefault,
            0,
        );
        account.grant_delegate(sample_delegate(delegate), 1).unwrap();

        let updated = account
            .update_delegate(
                delegate,
                Some(PermissionRole::Viewer),
                Some(Some("viewer".to_string())),
                Some(Some(20)),
                None,
                Some(vec![Pubkey::new_unique()]),
                None,
                None,
                Some(true),
                2,
            )
            .unwrap();

        assert_eq!(updated.role, PermissionRole::Viewer);
        assert_eq!(updated.label.as_deref(), Some("viewer"));
        assert_eq!(updated.valid_until_epoch, Some(20));
        assert!(updated.requires_reauth);
    }

    #[test]
    fn record_usage_enforces_daily_caps() {
        let owner = Pubkey::new_unique();
        let delegate = Pubkey::new_unique();
        let mut account = WalletPermissionAccount::new(
            owner,
            format!("did:aeko:{owner}"),
            owner,
            ProgramPolicyMode::DenyByDefault,
            0,
        );
        account.grant_delegate(sample_delegate(delegate), 1).unwrap();

        account
            .record_usage(delegate, None, None, 100, 1, 1, 10)
            .unwrap();
        let err = account
            .record_usage(delegate, None, None, 450, 1, 1, 11)
            .unwrap_err();
        assert_eq!(err, WalletPermissionsError::SpendLimitExceeded.into());
    }

    #[test]
    fn effective_permissions_resolve_expired_delegate() {
        let owner = Pubkey::new_unique();
        let delegate = Pubkey::new_unique();
        let mut account = WalletPermissionAccount::new(
            owner,
            format!("did:aeko:{owner}"),
            owner,
            ProgramPolicyMode::DenyByDefault,
            0,
        );
        account.grant_delegate(sample_delegate(delegate), 1).unwrap();

        let view = account.effective_permissions(delegate, 11);
        assert_eq!(view.status, Some(PermissionStatus::Expired));
        assert!(!view.active);
    }
}
