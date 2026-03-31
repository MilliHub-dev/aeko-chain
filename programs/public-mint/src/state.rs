use {
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct PublicMintPolicy {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub enabled: bool,
    pub per_wallet_limit: u128,
    pub window_epochs: u64,
    pub cooldown_epochs: u64,
    pub requires_allowlist: bool,
    pub anomaly_threshold: u32,
    pub fee_subsidy_enabled: bool,
    pub subsidy_app: Option<Pubkey>,
    pub is_initialized: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct WalletMintWindow {
    pub wallet: Pubkey,
    pub mint: Pubkey,
    pub window_start_epoch: u64,
    pub minted_in_window: u128,
    pub last_mint_epoch: u64,
    pub anomaly_score: u32,
    pub blocked: bool,
    pub subsidy_used_in_window: u128,
}

#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct PublicMintState {
    pub policy: PublicMintPolicy,
    pub wallet_windows: Vec<WalletMintWindow>,
    pub blocklist: Vec<Pubkey>,
    pub allowlist: Vec<Pubkey>,
}

impl PublicMintState {
    pub fn deserialize_padded(input: &[u8]) -> Result<Self, ProgramError> {
        let mut data = input;
        Self::deserialize(&mut data).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn is_blocklisted(&self, wallet: &Pubkey) -> bool {
        self.blocklist.iter().any(|blocked| blocked == wallet)
    }

    pub fn is_allowlisted(&self, wallet: &Pubkey) -> bool {
        self.allowlist.iter().any(|allowed| allowed == wallet)
    }

    pub fn upsert_wallet_window(
        &mut self,
        wallet: Pubkey,
        mint: Pubkey,
        current_epoch: u64,
    ) -> &mut WalletMintWindow {
        if let Some(index) = self
            .wallet_windows
            .iter()
            .position(|window| window.wallet == wallet && window.mint == mint)
        {
            let policy = &self.policy;
            let window = &mut self.wallet_windows[index];
            if current_epoch.saturating_sub(window.window_start_epoch) >= policy.window_epochs {
                window.window_start_epoch = current_epoch;
                window.minted_in_window = 0;
                window.subsidy_used_in_window = 0;
            }
            window
        } else {
            self.wallet_windows.push(WalletMintWindow {
                wallet,
                mint,
                window_start_epoch: current_epoch,
                minted_in_window: 0,
                last_mint_epoch: 0,
                anomaly_score: 0,
                blocked: false,
                subsidy_used_in_window: 0,
            });
            self.wallet_windows.last_mut().expect("wallet window inserted")
        }
    }

    pub fn note_failed_attempt(
        &mut self,
        wallet: Pubkey,
        mint: Pubkey,
        current_epoch: u64,
    ) -> &mut WalletMintWindow {
        let anomaly_threshold = self.policy.anomaly_threshold;
        let window = self.upsert_wallet_window(wallet, mint, current_epoch);
        window.anomaly_score = window.anomaly_score.saturating_add(1);
        if anomaly_threshold > 0 && window.anomaly_score >= anomaly_threshold {
            window.blocked = true;
        }
        window
    }
}
