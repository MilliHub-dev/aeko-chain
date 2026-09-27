//! Safe registry discovery surface.
//!
//! This endpoint exposes only Explorer API paths. Canonical registry values
//! remain behind the Social/Protocol registry handlers and key material is
//! never part of this response.

use {
    crate::{
        response::{self, DataEnvelope},
        state::SharedState,
    },
    axum::{extract::State, routing::get, Json, Router},
    serde::Serialize,
};

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegistryIndex {
    social: &'static str,
    protocol: &'static str,
}

pub fn router() -> Router<SharedState> {
    Router::new().route("/registry", get(get_registry_index))
}

async fn get_registry_index(State(state): State<SharedState>) -> Json<DataEnvelope<RegistryIndex>> {
    response::data_from_source(
        &state.network,
        RegistryIndex {
            social: "/registry/social",
            protocol: "/registry/protocol",
        },
        "registry-discovery",
    )
}

#[cfg(test)]
mod tests {
    use super::RegistryIndex;

    #[test]
    fn registry_index_never_contains_key_material_or_remote_origins() {
        let index = RegistryIndex {
            social: "/registry/social",
            protocol: "/registry/protocol",
        };
        let rendered = serde_json::to_string(&index).unwrap();
        assert_eq!(
            rendered,
            r#"{"social":"/registry/social","protocol":"/registry/protocol"}"#
        );
        assert!(!rendered.contains("key"));
        assert!(!rendered.contains("http"));
    }
}
