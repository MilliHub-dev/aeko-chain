use {
    aeko_rust_sdk::{
        build_freeze_wallet_instruction, build_initialize_collection_instruction,
        build_transaction_plan, build_update_metadata_instruction, build_update_delegate_instruction,
        default_token_721_program_id, default_wallet_permissions_program_id, FreezeWalletInput,
        InitializeCollectionInput, MetadataAttribute, NftMetadata, PermissionRole,
        SpendLimitPolicy, UpdateDelegateInput, UpdateMetadataInput,
    },
};

fn main() {
    let owner = fake_pubkey(1);
    let authority = fake_pubkey(2);
    let delegate = fake_pubkey(3);

    let collection_instruction = build_initialize_collection_instruction(&InitializeCollectionInput {
        program_id: default_token_721_program_id(),
        collection: fake_pubkey(4),
        authority: authority.clone(),
        name: "AEKO Creators".to_string(),
        symbol: "AEKOC".to_string(),
        base_uri: Some("https://assets.aeko.chain/collections/creators".to_string()),
    });

    let update_metadata_instruction = build_update_metadata_instruction(&UpdateMetadataInput {
        program_id: default_token_721_program_id(),
        token: fake_pubkey(5),
        authority: authority.clone(),
        metadata: NftMetadata {
            name: "AEKO Genesis Poster".to_string(),
            description: Some("Phase 4 Rust SDK demo flow".to_string()),
            uri: "https://assets.aeko.chain/nft/genesis-poster.json".to_string(),
            image_uri: Some("https://assets.aeko.chain/nft/genesis-poster.png".to_string()),
            attributes: vec![MetadataAttribute {
                trait_type: "series".to_string(),
                value: "phase4-demo".to_string(),
            }],
        },
    });

    let update_delegate_instruction = build_update_delegate_instruction(&UpdateDelegateInput {
        program_id: default_wallet_permissions_program_id(),
        permission_state: fake_pubkey(6),
        audit_log: fake_pubkey(7),
        owner: owner.clone(),
        delegate: delegate.clone(),
        role: Some(PermissionRole::Spender),
        label: Some(Some("social-distributor".to_string())),
        valid_until_epoch: Some(Some(365)),
        spend_limit: Some(SpendLimitPolicy {
            max_single_tx_aeko: Some(250_000),
            max_daily_aeko: Some(1_000_000),
            token_caps: Vec::new(),
        }),
        program_allowlist: Some(vec![default_token_721_program_id()]),
        token_allowlist: Some(Vec::new()),
        app_scope_hashes: Some(Vec::new()),
        requires_reauth: Some(false),
        current_epoch: 12,
        current_slot: 900,
    });

    let freeze_wallet_instruction = build_freeze_wallet_instruction(&FreezeWalletInput {
        program_id: default_wallet_permissions_program_id(),
        permission_state: fake_pubkey(8),
        audit_log: fake_pubkey(9),
        owner: owner.clone(),
        reason_code: Some(7),
        reauth_required_until_epoch: Some(13),
        current_epoch: 12,
        current_slot: 901,
    });

    let unsigned_transaction = build_transaction_plan(
        vec![collection_instruction, update_metadata_instruction],
        authority,
        "phase4-demo-blockhash",
    );
    let permission_plan = build_transaction_plan(
        vec![update_delegate_instruction, freeze_wallet_instruction],
        owner,
        "phase4-demo-blockhash",
    );

    println!(
        "unsigned AEKO-721 setup instructions: {}",
        unsigned_transaction.instructions.len()
    );
    println!(
        "prepared wallet-permissions instructions: {}",
        permission_plan.instructions.len()
    );
}

fn fake_pubkey(seed: u8) -> String {
    bs58::encode([seed; 32]).into_string()
}
