//! Shared Query-string types used by multiple resource modules.
//!
//! Each handler that takes filters declares its own Query struct so Axum
//! deserializes and validates the params at extraction time. This file
//! holds the building blocks they share (limit + cursor-based slot windows).

use serde::Deserialize;

const DEFAULT_LIST_LIMIT: usize = 25;
const MAX_LIST_LIMIT: usize = 500;

#[derive(Debug, Deserialize)]
pub struct SlotWindowParams {
    pub before: Option<u64>,
    pub after: Option<u64>,
    pub limit: Option<usize>,
}

impl SlotWindowParams {
    pub fn resolved_limit(&self) -> usize {
        clamp_limit(self.limit)
    }
}

pub fn clamp_limit(value: Option<usize>) -> usize {
    let n = value.unwrap_or(DEFAULT_LIST_LIMIT);
    n.clamp(1, MAX_LIST_LIMIT)
}

/// Per-handler reads of the store ask for "limit * 4" rows so server-side
/// filtering (by address, type, status, …) has a buffer to whittle from
/// before truncating back to the user's requested limit. The factor is
/// arbitrary; once the durable store lands the filter pushes down to SQL
/// and this helper goes away.
pub fn over_fetch(limit: usize) -> usize {
    limit.saturating_mul(4).min(MAX_LIST_LIMIT)
}
