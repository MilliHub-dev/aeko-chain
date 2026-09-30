//! HTTP composition and shared protocol helpers.

pub mod error;
pub mod response;
pub mod state;

use {
    crate::{config::ServerConfig, features},
    axum::{
        body::Body,
        http::{header, HeaderName, Method, Request},
        Router,
    },
    state::SharedState,
    tower_http::{
        compression::CompressionLayer,
        cors::{AllowOrigin, CorsLayer},
        limit::RequestBodyLimitLayer,
        request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
        timeout::TimeoutLayer,
        trace::{DefaultOnFailure, DefaultOnResponse, TraceLayer},
        LatencyUnit,
    },
};

pub fn build_router(state: SharedState, server: &ServerConfig) -> Router {
    let request_id_header = HeaderName::from_static("x-request-id");
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(server.cors_allowed_origins.clone()))
        .allow_methods([Method::GET, Method::HEAD, Method::POST, Method::OPTIONS])
        .allow_headers([
            header::ACCEPT,
            header::CONTENT_TYPE,
            request_id_header.clone(),
        ])
        .expose_headers([request_id_header.clone(), header::RETRY_AFTER])
        .max_age(std::time::Duration::from_secs(300));
    let trace = TraceLayer::new_for_http()
        .make_span_with(|request: &Request<Body>| {
            let request_id = request
                .headers()
                .get("x-request-id")
                .and_then(|value| value.to_str().ok())
                .unwrap_or("unknown");
            tracing::info_span!(
                "http.request",
                request_id = %request_id,
                http.method = %request.method(),
                http.path = %request.uri().path(),
            )
        })
        .on_response(
            DefaultOnResponse::new()
                .level(tracing::Level::INFO)
                .latency_unit(LatencyUnit::Millis),
        )
        .on_failure(
            DefaultOnFailure::new()
                .level(tracing::Level::ERROR)
                .latency_unit(LatencyUnit::Millis),
        );

    // SetRequestIdLayer stays outside TraceLayer so the generated/incoming ID
    // is present when the request span is created. Propagation adds the same ID
    // to the response for end-to-end correlation through the public API edge and Operations Web BFF.
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
