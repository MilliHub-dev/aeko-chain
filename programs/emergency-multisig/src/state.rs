/// State accounts for the emergency-multisig program.
///
/// Implements the kill-switch quorum for zone freezes and key revocations
/// (security-architecture.md §11, phase3-task.md Contract 4).
use {
    crate::error::EmergencyMultisigError,
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

// ── PDA seeds ─────────────────────────────────────────────────────────────────
// multisig_config:  [b"multisig"]
// proposal:         [b"proposal", proposal_id]
// vote:             [b"vote", proposal_id, voter_pubkey]

pub const MULTISIG_CONFIG_SEED: &[u8] = b"multisig";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const VOTE_SEED: &[u8] = b"vote";

/// Maximum number of signers in the multisig.
pub const MAX_SIGNERS: usize = 11;

/// The action a proposal requests.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum ProposedAction {
    /// Freeze a subnet immediately.
    FreezeSubnet { subnet_id: [u8; 32], reason_code: u16 },
    /// Unfreeze a previously frozen subnet.
    UnfreezeSubnet { subnet_id: [u8; 32] },
    /// Emergency-revoke a key (marks it Compromised, bypasses normal quorum).
    EmergencyRevokeKey { key_id: [u8; 32], reason_code: u16 },
    /// Upgrade the clearance policy hash for a tier (future-proofing).
    UpgradeClearancePolicy { tier_byte: u8, new_policy_hash: [u8; 32] },
}

/// Status of a proposal.
#[derive(Clone, Copy, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub enum ProposalStatus {
    /// Open for approval.
    Pending,
    /// Quorum reached and executed.
    Executed,
    /// Cancelled by the proposer or upgrade authority.
    Cancelled,
}

/// Singleton config for the emergency multisig.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct MultisigConfig {
    pub is_initialized: bool,
    /// Upgrade authority for this multisig (can add/remove signers).
    pub upgrade_authority: Pubkey,
    /// The set of authorised signers.
    pub signers: Vec<Pubkey>,
    /// Required approvals for `FreezeSubnet` / `UnfreezeSubnet`.
    pub freeze_quorum: u8,
    /// Required approvals for `EmergencyRevokeKey`.
    pub revoke_quorum: u8,
    /// Required approvals for `UpgradeClearancePolicy`.
    pub policy_quorum: u8,
    pub created_at_slot: u64,
}

impl MultisigConfig {
    pub fn new(
        upgrade_authority: Pubkey,
        signers: Vec<Pubkey>,
        freeze_quorum: u8,
        revoke_quorum: u8,
        policy_quorum: u8,
        current_slot: u64,
    ) -> Self {
        Self {
            is_initialized: true,
            upgrade_authority,
            signers,
            freeze_quorum,
            revoke_quorum,
            policy_quorum,
            created_at_slot: current_slot,
        }
    }

    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            Ok(())
        } else {
            Err(EmergencyMultisigError::Uninitialized.into())
        }
    }

    pub fn is_signer(&self, pubkey: &Pubkey) -> bool {
        self.signers.contains(pubkey) || *pubkey == self.upgrade_authority
    }

    pub fn required_approvals(&self, action: &ProposedAction) -> u8 {
        match action {
            ProposedAction::FreezeSubnet { .. } | ProposedAction::UnfreezeSubnet { .. } => {
                self.freeze_quorum
            }
            ProposedAction::EmergencyRevokeKey { .. } => self.revoke_quorum,
            ProposedAction::UpgradeClearancePolicy { .. } => self.policy_quorum,
        }
    }
}

/// One pending or executed proposal.
///
/// PDA seed: `[b"proposal", proposal_id]`
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct Proposal {
    pub proposal_id: [u8; 32],
    pub proposer: Pubkey,
    pub action: ProposedAction,
    pub status: ProposalStatus,
    pub approval_count: u8,
    pub required_approvals: u8,
    pub created_at_slot: u64,
    pub expires_at_slot: u64,
}

impl Proposal {
    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn is_expired(&self, current_slot: u64) -> bool {
        current_slot > self.expires_at_slot
    }

    pub fn quorum_met(&self) -> bool {
        self.approval_count >= self.required_approvals
    }

    pub fn ensure_executable(&self, current_slot: u64) -> Result<(), ProgramError> {
        if self.status == ProposalStatus::Executed {
            return Err(EmergencyMultisigError::ProposalAlreadyExecuted.into());
        }
        if self.status == ProposalStatus::Cancelled {
            return Err(EmergencyMultisigError::ProposalCancelled.into());
        }
        if self.is_expired(current_slot) {
            return Err(EmergencyMultisigError::ProposalExpired.into());
        }
        if !self.quorum_met() {
            return Err(EmergencyMultisigError::QuorumNotMet.into());
        }
        Ok(())
    }
}

/// Record that one signer has approved a proposal.
///
/// PDA seed: `[b"vote", proposal_id, voter_pubkey]`
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct ProposalVote {
    pub proposal_id: [u8; 32],
    pub voter: Pubkey,
    pub voted_at_slot: u64,
}

impl ProposalVote {
    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub fn deserialize_multisig_config(data: &[u8]) -> Result<MultisigConfig, ProgramError> {
    let mut d = data;
    MultisigConfig::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn deserialize_proposal(data: &[u8]) -> Result<Proposal, ProgramError> {
    let mut d = data;
    Proposal::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn deserialize_vote(data: &[u8]) -> Result<ProposalVote, ProgramError> {
    let mut d = data;
    ProposalVote::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_config(freeze_q: u8, revoke_q: u8) -> MultisigConfig {
        let authority = Pubkey::new_unique();
        let signers: Vec<Pubkey> = (0..5).map(|_| Pubkey::new_unique()).collect();
        MultisigConfig::new(authority, signers, freeze_q, revoke_q, revoke_q, 1)
    }

    fn dummy_proposal(required: u8, expires_at: u64) -> Proposal {
        Proposal {
            proposal_id: [1u8; 32],
            proposer: Pubkey::new_unique(),
            action: ProposedAction::FreezeSubnet { subnet_id: [2u8; 32], reason_code: 1 },
            status: ProposalStatus::Pending,
            approval_count: 0,
            required_approvals: required,
            created_at_slot: 1,
            expires_at_slot: expires_at,
        }
    }

    #[test]
    fn quorum_met_only_when_count_reaches_required() {
        let mut p = dummy_proposal(3, 1000);
        assert!(!p.quorum_met());
        p.approval_count = 2;
        assert!(!p.quorum_met());
        p.approval_count = 3;
        assert!(p.quorum_met());
    }

    #[test]
    fn expiry_works_correctly() {
        let p = dummy_proposal(3, 100);
        assert!(!p.is_expired(100));
        assert!(p.is_expired(101));
    }

    #[test]
    fn ensure_executable_fails_when_not_quorum() {
        let p = dummy_proposal(3, 1000);
        assert!(p.ensure_executable(50).is_err());
    }

    #[test]
    fn ensure_executable_fails_when_expired() {
        let mut p = dummy_proposal(1, 100);
        p.approval_count = 1;
        assert!(p.ensure_executable(101).is_err());
    }

    #[test]
    fn ensure_executable_succeeds_with_quorum_and_not_expired() {
        let mut p = dummy_proposal(2, 1000);
        p.approval_count = 2;
        assert!(p.ensure_executable(500).is_ok());
    }

    #[test]
    fn is_signer_includes_upgrade_authority() {
        let authority = Pubkey::new_unique();
        let config = MultisigConfig::new(authority, vec![], 3, 4, 4, 1);
        assert!(config.is_signer(&authority));
        assert!(!config.is_signer(&Pubkey::new_unique()));
    }

    #[test]
    fn required_approvals_matches_action_type() {
        let config = dummy_config(3, 4);
        assert_eq!(
            config.required_approvals(&ProposedAction::FreezeSubnet { subnet_id: [0u8; 32], reason_code: 0 }),
            3
        );
        assert_eq!(
            config.required_approvals(&ProposedAction::EmergencyRevokeKey { key_id: [0u8; 32], reason_code: 0 }),
            4
        );
    }
}
