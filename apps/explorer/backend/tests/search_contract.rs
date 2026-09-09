use aeko_explorer_backend::models::{BlockRecord, SearchResultRecord};

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

    assert_eq!(value.get("kind").and_then(|item| item.as_str()), Some("block"));
    assert_eq!(value.get("slot").and_then(|item| item.as_u64()), Some(42));
    assert_eq!(
        value.get("blockhash").and_then(|item| item.as_str()),
        Some("blockhash-42")
    );
    assert!(value.get("block").is_none());
}
