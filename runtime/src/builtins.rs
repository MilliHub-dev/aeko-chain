use {
    aeko_program_runtime::invoke_context::BuiltinFunctionWithContext,
    aeko_sdk::{
        bpf_loader, bpf_loader_deprecated, bpf_loader_upgradeable, feature_set, pubkey::Pubkey,
    },
};

/// Transitions of built-in programs at epoch bondaries when features are activated.
pub struct BuiltinPrototype {
    pub feature_id: Option<Pubkey>,
    pub program_id: Pubkey,
    pub name: &'static str,
    pub entrypoint: BuiltinFunctionWithContext,
}

impl std::fmt::Debug for BuiltinPrototype {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        let mut builder = f.debug_struct("BuiltinPrototype");
        builder.field("program_id", &self.program_id);
        builder.field("name", &self.name);
        builder.field("feature_id", &self.feature_id);
        builder.finish()
    }
}

#[cfg(RUSTC_WITH_SPECIALIZATION)]
impl aeko_frozen_abi::abi_example::AbiExample for BuiltinPrototype {
    fn example() -> Self {
        // BuiltinPrototype isn't serializable by definition.
        aeko_program_runtime::declare_process_instruction!(MockBuiltin, 0, |_invoke_context| {
            // Do nothing
            Ok(())
        });
        Self {
            feature_id: None,
            program_id: Pubkey::default(),
            name: "",
            entrypoint: MockBuiltin::vm,
        }
    }
}

pub static BUILTINS: &[BuiltinPrototype] = &[
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_system_program::id(),
        name: "system_program",
        entrypoint: aeko_system_program::system_processor::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_vote_program::id(),
        name: "vote_program",
        entrypoint: aeko_vote_program::vote_processor::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_stake_program::id(),
        name: "stake_program",
        entrypoint: aeko_stake_program::stake_instruction::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_config_program::id(),
        name: "config_program",
        entrypoint: aeko_config_program::config_processor::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: bpf_loader_deprecated::id(),
        name: "aeko_bpf_loader_deprecated_program",
        entrypoint: aeko_bpf_loader_program::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: bpf_loader::id(),
        name: "aeko_bpf_loader_program",
        entrypoint: aeko_bpf_loader_program::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: bpf_loader_upgradeable::id(),
        name: "aeko_bpf_loader_upgradeable_program",
        entrypoint: aeko_bpf_loader_program::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_sdk::compute_budget::id(),
        name: "compute_budget_program",
        entrypoint: aeko_compute_budget_program::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_sdk::address_lookup_table::program::id(),
        name: "address_lookup_table_program",
        entrypoint: aeko_address_lookup_table_program::processor::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: Some(feature_set::zk_token_sdk_enabled::id()),
        program_id: aeko_zk_token_sdk::zk_token_proof_program::id(),
        name: "zk_token_proof_program",
        entrypoint: aeko_zk_token_proof_program::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: Some(feature_set::enable_program_runtime_v2_and_loader_v4::id()),
        program_id: aeko_sdk::loader_v4::id(),
        name: "loader_v4",
        entrypoint: aeko_loader_v4_program::Entrypoint::vm,
    },
    // ---- AEKO SocialFi native builtins ----
    // Program IDs are fixed-byte placeholders (e.g. [17u8; 32]) defined in each
    // program's lib.rs. No feature gate: these are always active. State accounts
    // for each program must be initialized post-genesis via the bootstrap
    // binary (see bin/social-bootstrap and docs/operations/coolify.md).
    // Pubkey::new_from_array is const, so we build the ID here rather than
    // calling each crate's non-const `id()` (which can't run in a static).
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_sdk::pubkey::Pubkey::new_from_array(
            aeko_social_posts_program::SOCIAL_POSTS_PROGRAM_ID_BYTES,
        ),
        name: "aeko_social_posts_program",
        entrypoint: aeko_social_posts_program::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_sdk::pubkey::Pubkey::new_from_array(
            aeko_social_rewards_program::SOCIAL_REWARDS_PROGRAM_ID_BYTES,
        ),
        name: "aeko_social_rewards_program",
        entrypoint: aeko_social_rewards_program::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_sdk::pubkey::Pubkey::new_from_array(
            aeko_social_staking_program::SOCIAL_STAKING_PROGRAM_ID_BYTES,
        ),
        name: "aeko_social_staking_program",
        entrypoint: aeko_social_staking_program::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_sdk::pubkey::Pubkey::new_from_array(
            aeko_social_anti_spam_program::SOCIAL_ANTI_SPAM_PROGRAM_ID_BYTES,
        ),
        name: "aeko_social_anti_spam_program",
        entrypoint: aeko_social_anti_spam_program::Entrypoint::vm,
    },
    BuiltinPrototype {
        feature_id: None,
        program_id: aeko_sdk::pubkey::Pubkey::new_from_array(
            aeko_social_monetization_program::SOCIAL_MONETIZATION_PROGRAM_ID_BYTES,
        ),
        name: "aeko_social_monetization_program",
        entrypoint: aeko_social_monetization_program::Entrypoint::vm,
    },
];
