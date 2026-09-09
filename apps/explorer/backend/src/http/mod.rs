//! HTTP composition and shared protocol helpers.

pub mod error;
pub mod response;
pub mod state;

use {
    crate::{config::ServerConfig, features},
    axum::{
        http::{header, HeaderName, Method},
        Router,
    },
    state::SharedState,
    tower_http::{
        compression::CompressionLayer,
        cors::{Any, CorsLayer},
        limit::RequestBodyLimitLayer,
        request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
        timeout::TimeoutLayer,
        trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer},
        LatencyUnit,
    },
};

pub fn build_router(state: SharedState, server: &ServerConfig) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::HEAD, Method::OPTIONS])
        .allow_headers([header::ACCEPT, header::CONTENT_TYPE])
        .max_age(std::time::Duration::from_secs(300));
    let request_id_header = HeaderName::from_static("x-request-id");
    let trace = TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().include_headers(false))
        .on_response(
            DefaultOnResponse::new()
                .level(tracing::Level::INFO)
                .latency_unit(LatencyUnit::Millis),
        );

    features::router()
        .with_state(state)
        .layer(PropagateRequestIdLayer::new(request_id_header.clone()))
        .layer(trace)
        .layer(SetRequestIdLayer::new(request_id_header, MakeRequestUuid))
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::new(server.request_timeout))
        .layer(RequestBodyLimitLayer::new(server.max_body_bytes))
        .layer(cors)
}
