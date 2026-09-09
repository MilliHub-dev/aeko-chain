//! Explorer tracing and structured logging.

use {
    std::env,
    tracing_subscriber::{fmt, prelude::*, EnvFilter},
};

pub fn init() {
    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,hyper=warn,reqwest=warn"));

    let json_logs = env::var("AEKO_EXPLORER_LOG_FORMAT")
        .map(|value| value.eq_ignore_ascii_case("json"))
        .unwrap_or(false);

    let registry = tracing_subscriber::registry().with(env_filter);
    if json_logs {
        registry.with(fmt::layer().json()).init();
    } else {
        registry.with(fmt::layer().with_target(false)).init();
    }
}
