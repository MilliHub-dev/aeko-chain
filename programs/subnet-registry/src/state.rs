/// State accounts for the subnet-registry program.
///
/// Manages permissioned subnet lifecycle, membership ACLs, and freeze controls
/// (security-architecture.md §5, Ticket 3.1.5).
use {
    crate::error::SubnetRegistryError,
    aeko_permission_types::ClearanceTier,
    aeko_sdk::{program_error::ProgramError, pubkey::Pubkey},
    borsh::{BorshDeserialize, BorshSerialize},
};

// ── PDA seeds ─────────────────────────────────────────────────────────────────
// subnet_record:    [b"subnet",  subnet_id]
// subnet_member:    [b"member",  subnet_id, member_pubkey]

pub const SUBNET_RECORD_SEED: &[u8] = b"subnet";
pub const SUBNET_MEMBER_SEED: &[u8] = b"member";
pub const REGISTRY_CONFIG_SEED: &[u8] = b"subnet-config";

/// Singleton config for the subnet registry.
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SubnetRegistryConfig {
    pub is_initialized: bool,
    pub upgrade_authority: Pubkey,
    pub created_at_slot: u64,
}

impl SubnetRegistryConfig {
    pub fn new(upgrade_authority: Pubkey, current_slot: u64) -> Self {
        Self { is_initialized: true, upgrade_authority, created_at_slot: current_slot }
    }

    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn ensure_initialized(&self) -> Result<(), ProgramError> {
        if self.is_initialized {
            Ok(())
        } else {
            Err(SubnetRegistryError::Uninitialized.into())
        }
    }

    pub fn ensure_upgrade_authority(&self, signer: &Pubkey) -> Result<(), ProgramError> {
        if *signer == self.upgrade_authority {
            Ok(())
        } else {
            Err(SubnetRegistryError::Unauthorized.into())
        }
    }
}

/// Descriptor for one permissioned subnet.
///
/// PDA seed: `[b"subnet", subnet_id]`
///
/// NOTE: The first two bytes of serialised data are:
///   byte 0: `is_initialized` bool (1 = true)
///   byte 1: `is_frozen` bool
/// The `EvaluateAccess` processor in permission-registry reads these bytes directly
/// for zero-copy subnet freeze checks (see permission-registry processor §Step 3).
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SubnetRecord {
    /// Always 1 once created.
    pub is_initialized: bool,
    /// True if the subnet is frozen — all new transactions are halted.
    pub is_frozen: bool,
    /// 32-byte subnet identifier (PDA-derived).
    pub subnet_id: [u8; 32],
    /// The authority that owns this subnet (may call Freeze/Unfreeze/AddMember).
    pub owner: Pubkey,
    /// Minimum clearance tier required to enter this subnet.
    pub min_clearance: ClearanceTier,
    /// Non-zero when frozen. Stores an application-level reason code.
    pub freeze_reason_code: Option<u16>,
    /// Validator pubkeys that are members of this subnet.
    pub validator_set: Vec<Pubkey>,
    /// Slot at which the subnet was created.
    pub created_at_slot: u64,
}

impl SubnetRecord {
    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }

    pub fn ensure_not_frozen(&self) -> Result<(), ProgramError> {
        if self.is_frozen {
            Err(SubnetRegistryError::SubnetFrozen.into())
        } else {
            Ok(())
        }
    }

    pub fn freeze(&mut self, reason_code: u16) {
        self.is_frozen = true;
        self.freeze_reason_code = Some(reason_code);
    }

    pub fn unfreeze(&mut self) {
        self.is_frozen = false;
        self.freeze_reason_code = None;
    }

    pub fn add_member(&mut self, member: Pubkey) -> Result<(), ProgramError> {
        if self.validator_set.contains(&member) {
            return Err(SubnetRegistryError::MemberAlreadyExists.into());
        }
        self.validator_set.push(member);
        Ok(())
    }

    pub fn remove_member(&mut self, member: &Pubkey) -> Result<(), ProgramError> {
        let pos = self
            .validator_set
            .iter()
            .position(|k| k == member)
            .ok_or::<ProgramError>(SubnetRegistryError::MemberNotFound.into())?;
        self.validator_set.swap_remove(pos);
        Ok(())
    }
}

/// Record that a wallet / validator is a member of a specific subnet.
///
/// PDA seed: `[b"member", subnet_id, member_pubkey]`
#[derive(Clone, Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize)]
pub struct SubnetMembership {
    pub subnet_id: [u8; 32],
    pub member: Pubkey,
    /// The key_id (in revocation-registry) associated with this membership.
    pub key_id: [u8; 32],
    pub joined_at_slot: u64,
    pub is_active: bool,
}

impl SubnetMembership {
    pub fn deserialize_padded(data: &[u8]) -> Result<Self, ProgramError> {
        let mut d = data;
        Self::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

pub fn deserialize_subnet_record(data: &[u8]) -> Result<SubnetRecord, ProgramError> {
    let mut d = data;
    SubnetRecord::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

pub fn deserialize_subnet_membership(data: &[u8]) -> Result<SubnetMembership, ProgramError> {
    let mut d = data;
    SubnetMembership::deserialize(&mut d).map_err(|_| ProgramError::InvalidAccountData)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_subnet(frozen: bool) -> SubnetRecord {
        SubnetRecord {
            is_initialized: true,
            is_frozen: frozen,
            subnet_id: [1u8; 32],
            owner: Pubkey::new_unique(),
            min_clearance: ClearanceTier::Enterprise,
            freeze_reason_code: if frozen { Some(1) } else { None },
            validator_set: vec![],
            created_at_slot: 1,
        }
    }

    #[test]
    fn freeze_and_unfreeze() {
        let mut subnet = dummy_subnet(false);
        assert!(subnet.ensure_not_frozen().is_ok());
        subnet.freeze(42);
        assert!(subnet.ensure_not_frozen().is_err());
        assert_eq!(subnet.freeze_reason_code, Some(42));
        subnet.unfreeze();
        assert!(subnet.ensure_not_frozen().is_ok());
        assert_eq!(subnet.freeze_reason_code, None);
    }

    #[test]
    fn add_and_remove_members() {
        let mut subnet = dummy_subnet(false);
        let member_a = Pubkey::new_unique();
        let member_b = Pubkey::new_unique();

        subnet.add_member(member_a).unwrap();
        subnet.add_member(member_b).unwrap();
        assert_eq!(subnet.validator_set.len(), 2);

        // Duplicate add is rejected.
        assert!(subnet.add_member(member_a).is_err());

        subnet.remove_member(&member_a).unwrap();
        assert_eq!(subnet.validator_set.len(), 1);

        // Remove non-existent member is rejected.
        assert!(subnet.remove_member(&member_a).is_err());
    }

    #[test]
    fn frozen_subnet_is_not_frozen_after_unfreeze() {
        let mut subnet = dummy_subnet(true);
        assert!(subnet.is_frozen);
        subnet.unfreeze();
        assert!(!subnet.is_frozen);
    }

    #[test]
    fn subnet_record_borsh_round_trip() {
        let mut subnet = dummy_subnet(false);
        subnet.add_member(Pubkey::new_unique()).unwrap();
        let encoded = borsh::to_vec(&subnet).unwrap();
        let decoded = SubnetRecord::deserialize_padded(&encoded).unwrap();
        assert_eq!(subnet, decoded);
    }

    #[test]
    fn is_frozen_byte_is_second_byte_of_serialised_record() {
        // The EvaluateAccess processor in permission-registry reads byte[1] for
        // the frozen flag — verify the borsh layout matches.
        let frozen = dummy_subnet(true);
        let encoded = borsh::to_vec(&frozen).unwrap();
        assert_eq!(encoded[0], 1, "is_initialized should be byte 0");
        assert_eq!(encoded[1], 1, "is_frozen should be byte 1");

        let not_frozen = dummy_subnet(false);
        let encoded2 = borsh::to_vec(&not_frozen).unwrap();
        assert_eq!(encoded2[1], 0, "is_frozen=false should be byte 1 = 0");
    }
}
