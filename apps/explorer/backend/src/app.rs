//! HTTP router and middleware composition.

use {
    crate::{config::ServerConfig, features, state::SharedState},
    axum::Router,
    tower_http::{
        cors::{Any, CorsLayer},
        limit::RequestBodyLimitLayer,
        timeout::TimeoutLayer,
        trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer},
        LatencyUnit,
    },
};

pub fn build_router(state: SharedState, server: &ServerConfig) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .max_age(std::time::Duration::from_secs(300));
    let trace = TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().include_headers(false))
        .on_response(
            DefaultOnResponse::new()
                .level(tracing::Level::INFO)
                .latency_unit(LatencyUnit::Millis),
        );

    features::router()
        .with_state(state)
        .layer(trace)
        .layer(TimeoutLayer::new(server.request_timeout))
        .layer(RequestBodyLimitLayer::new(server.max_body_bytes))
        .layer(cors)
}
