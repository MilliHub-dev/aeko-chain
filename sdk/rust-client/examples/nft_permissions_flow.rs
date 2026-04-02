use {
    aeko_rust_sdk::{
        build_freeze_wallet_instruction, build_initialize_collection_instruction,
        build_signed_transaction, build_unsigned_transaction, build_update_metadata_instruction,
        build_update_delegate_instruction, FreezeWalletInput, InitializeCollectionInput,
        UpdateDelegateInput, UpdateMetadataInput,
    },
    aeko_sdk::{
        hash::Hash,
        pubkey::Pubkey,
        signature::{Keypair, Signer},
    },
    aeko_token_721_program::state::{MetadataAttribute, NftMetadata},
    aeko_wallet_permissions_program::state::{PermissionRole, SpendLimitPolicy},
};

fn main() {
    let owner = Keypair::new();
    let authority = Keypair::new();
    let delegate = Pubkey::new_unique();

    let collection_instruction = build_initialize_collection_instruction(&InitializeCollectionInput {
        program_id: aeko_token_721_program::id(),
        collection: Pubkey::new_unique(),
        authority: authority.pubkey(),
        name: "AEKO Creators".to_string(),
        symbol: "AEKOC".to_string(),
        base_uri: Some("https://assets.aeko.chain/collections/creators".to_string()),
    });

    let update_metadata_instruction = build_update_metadata_instruction(&UpdateMetadataInput {
        program_id: aeko_token_721_program::id(),
        token: Pubkey::new_unique(),
        authority: authority.pubkey(),
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
        program_id: aeko_wallet_permissions_program::id(),
        permission_state: Pubkey::new_unique(),
        audit_log: Pubkey::new_unique(),
        owner: owner.pubkey(),
        delegate,
        role: Some(PermissionRole::Spender),
        label: Some(Some("social-distributor".to_string())),
        valid_until_epoch: Some(Some(365)),
        spend_limit: Some(SpendLimitPolicy {
            max_single_tx_aeko: Some(250_000),
            max_daily_aeko: Some(1_000_000),
            token_caps: Vec::new(),
        }),
        program_allowlist: Some(vec![aeko_token_721_program::id()]),
        token_allowlist: Some(Vec::new()),
        app_scope_hashes: Some(Vec::new()),
        requires_reauth: Some(false),
        current_epoch: 12,
        current_slot: 900,
    });

    let freeze_wallet_instruction = build_freeze_wallet_instruction(&FreezeWalletInput {
        program_id: aeko_wallet_permissions_program::id(),
        permission_state: Pubkey::new_unique(),
        audit_log: Pubkey::new_unique(),
        owner: owner.pubkey(),
        reason_code: Some(7),
        reauth_required_until_epoch: Some(13),
        current_epoch: 12,
        current_slot: 901,
    });

    let recent_blockhash = Hash::new_unique();
    let unsigned_transaction = build_unsigned_transaction(
        vec![collection_instruction, update_metadata_instruction],
        Some(&authority.pubkey()),
        recent_blockhash,
    );
    let signed_transaction = build_signed_transaction(
        vec![update_delegate_instruction, freeze_wallet_instruction],
        Some(&owner.pubkey()),
        &[&owner],
        recent_blockhash,
    );

    println!(
        "unsigned AEKO-721 setup instructions: {}",
        unsigned_transaction.message.instructions.len()
    );
    println!(
        "signed wallet-permissions instructions: {}",
        signed_transaction.message.instructions.len()
    );
}
