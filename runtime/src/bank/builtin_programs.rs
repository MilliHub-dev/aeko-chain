#[cfg(test)]
mod tests {
    use {
        crate::bank::*,
        aeko_sdk::{
            ed25519_program, feature_set::FeatureSet, genesis_config::create_genesis_config,
            pubkey::Pubkey,
        },
    };

    #[test]
    fn test_apply_builtin_program_feature_transitions_for_new_epoch() {
        let (genesis_config, _mint_keypair) = create_genesis_config(100_000);

        let mut bank = Bank::new_for_tests(&genesis_config);
        bank.feature_set = Arc::new(FeatureSet::all_enabled());
        bank.finish_init(&genesis_config, None, false);

        // Overwrite precompile accounts to simulate a cluster which already added precompiles.
        for precompile in get_precompiles() {
            bank.store_account(&precompile.program_id, &AccountSharedData::default());
            // Simulate cluster which added ed25519 precompile with a system program owner
            if precompile.program_id == ed25519_program::id() {
                bank.add_precompiled_account_with_owner(
                    &precompile.program_id,
                    aeko_sdk::system_program::id(),
                );
            } else {
                bank.add_precompiled_account(&precompile.program_id);
            }
        }

        // Normally feature transitions are applied to a bank that hasn't been
        // frozen yet.  Freeze the bank early to ensure that no account changes
        // are made.
        bank.freeze();

        // Simulate crossing an epoch boundary for a new bank
        let only_apply_transitions_for_new_features = true;
        bank.apply_builtin_program_feature_transitions(
            only_apply_transitions_for_new_features,
            &HashSet::new(),
        );
    }

    #[test]
    fn test_startup_from_snapshot_after_precompile_transition() {
        let (genesis_config, _mint_keypair) = create_genesis_config(100_000);

        let mut bank = Bank::new_for_tests(&genesis_config);
        bank.feature_set = Arc::new(FeatureSet::all_enabled());
        bank.finish_init(&genesis_config, None, false);

        // Overwrite precompile accounts to simulate a cluster which already added precompiles.
        for precompile in get_precompiles() {
            bank.store_account(&precompile.program_id, &AccountSharedData::default());
            bank.add_precompiled_account(&precompile.program_id);
        }

        bank.freeze();

        // Simulate starting up from snapshot finishing the initialization for a frozen bank
        bank.finish_init(&genesis_config, None, false);
    }

    fn aeko_token_program_ids() -> [Pubkey; 5] {
        [
            aeko_tokenomics_program::id(),
            aeko_token_20_program::id(),
            aeko_public_mint_program::id(),
            aeko_token_721_program::id(),
            aeko_nft_marketplace_program::id(),
        ]
    }

    fn aeko_permission_program_ids() -> [Pubkey; 6] {
        [
            aeko_wallet_permissions_program::id(),
            aeko_permission_registry_program::id(),
            aeko_revocation_registry_program::id(),
            aeko_subnet_registry_program::id(),
            aeko_emergency_multisig_program::id(),
            aeko_finality_oracle_program::id(),
        ]
    }

    #[test]
    fn test_snapshot_restore_skips_inactive_aeko_protocol_builtins() {
        let (genesis_config, _mint_keypair) = create_genesis_config(100_000);
        let mut bank = Bank::new_for_tests(&genesis_config);
        bank.feature_set = Arc::new(FeatureSet::default());

        for program_id in aeko_token_program_ids()
            .into_iter()
            .chain(aeko_permission_program_ids())
        {
            assert!(
                bank.get_account(&program_id).is_none(),
                "historical bank unexpectedly contains gated program {program_id}"
            );
        }

        bank.freeze();
        bank.finish_init(&genesis_config, None, false);

        for program_id in aeko_token_program_ids()
            .into_iter()
            .chain(aeko_permission_program_ids())
        {
            assert!(
                bank.get_account(&program_id).is_none(),
                "snapshot restore inserted inactive gated program {program_id}"
            );
        }
    }

    #[test]
    fn test_aeko_protocol_builtins_install_after_feature_activation() {
        let (genesis_config, _mint_keypair) = create_genesis_config(100_000);
        let parent = Arc::new(Bank::new_for_tests(&genesis_config));
        let mut bank = Bank::new_from_parent(parent, &Pubkey::default(), 1);

        let mut feature_set = FeatureSet::default();
        feature_set.activate(&feature_set::aeko_token_programs_v1::id(), bank.slot());
        feature_set.activate(&feature_set::aeko_permission_layer_v1::id(), bank.slot());
        bank.feature_set = Arc::new(feature_set);

        bank.apply_builtin_program_feature_transitions(false, &HashSet::new());

        for program_id in aeko_token_program_ids()
            .into_iter()
            .chain(aeko_permission_program_ids())
        {
            let account = bank
                .get_account(&program_id)
                .unwrap_or_else(|| panic!("activated builtin {program_id} was not installed"));
            assert!(account.executable(), "builtin {program_id} is not executable");
        }
    }

}