use aeko_explorer_backend::models::{
    BlockRecord, NftCollectionRecord, SearchResultRecord, TokenMintRecord,
};

#[test]
fn search_results_use_the_flat_internally_tagged_json_contract() {
    let value = serde_json::to_value(SearchResultRecord::Block(BlockRecord {
        slot: 42,
        blockhash: "blockhash-42".to_string(),
        parent_slot: 41,
        transaction_count: 3,
        producer: None,
        unix_timestamp: Some(1_700_000_000),
    }))
    .expect("search result should serialize");

    assert_eq!(
        value.get("kind").and_then(|item| item.as_str()),
        Some("block")
    );
    assert_eq!(value.get("slot").and_then(|item| item.as_u64()), Some(42));
    assert_eq!(
        value.get("blockhash").and_then(|item| item.as_str()),
        Some("blockhash-42")
    );
    assert!(value.get("block").is_none());
}

#[test]
fn search_contract_serializes_asset_entity_result_kinds() {
    let token = serde_json::to_value(SearchResultRecord::TokenMint(TokenMintRecord {
        mint: "mint-1".to_string(),
        name: "Integration Token".to_string(),
        symbol: "ITEST".to_string(),
        ..TokenMintRecord::default()
    }))
    .expect("token search result should serialize");
    assert_eq!(
        token.get("kind").and_then(|item| item.as_str()),
        Some("tokenMint")
    );

    let collection = serde_json::to_value(SearchResultRecord::Collection(
        NftCollectionRecord {
            collection_id: "collection-1".to_string(),
            name: "Integration Collection".to_string(),
            symbol: "ICOL".to_string(),
            ..NftCollectionRecord::default()
        },
    ))
    .expect("collection search result should serialize");
    assert_eq!(
        collection.get("kind").and_then(|item| item.as_str()),
        Some("collection")
    );
}
