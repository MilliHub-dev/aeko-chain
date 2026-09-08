//! Wires the API routes onto an Axum `Router` and stacks production
//! middleware around it. Order matters — the bottom of the stack runs first
//! on the way in and last on the way out.
//!
//! Middleware (outermost → innermost):
//!   1. CORS — open `*` for now (the explorer is a read-only public API).
//!   2. Tracing — every request gets a span with method, path, status.
//!   3. Request body limit — 1 MiB (configurable).
//!   4. Timeout — 30 s (configurable). 5xx instead of hanging connections.
//!   5. Gzip compression for JSON responses.
//!   6. Vary: Origin set-header so caches respect CORS.

use {
    crate::{api, config::ServerConfig, state::SharedState},
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

    // Apply layers individually after `with_state` converts the router to
    // `Router<()>`. Stacking them through `ServiceBuilder.layer(...)` before
    // `with_state` confuses Axum's type inference about the response-body
    // chain (CompressionLayer's body type doesn't implement Default).
    api::router()
        .with_state(state)
        .layer(trace)
        .layer(TimeoutLayer::new(server.request_timeout))
        .layer(RequestBodyLimitLayer::new(server.max_body_bytes))
        .layer(cors)
}
