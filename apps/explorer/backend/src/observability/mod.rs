//! Explorer tracing and structured application logging.

use {
    anyhow::{Context, Result},
    std::env,
    tracing_subscriber::{fmt, prelude::*, EnvFilter},
};

const DEFAULT_FILTER: &str = "info,tower_http=info,hyper=warn,reqwest=warn,sqlx=warn";
const SERVICE: &str = "aeko-explorer-api";


pub fn endpoint_origin(value: &str) -> String {
    url::Url::parse(value)
        .map(|parsed| parsed.origin().ascii_serialization())
        .unwrap_or_else(|_| "[invalid endpoint]".to_string())
}

pub fn init() -> Result<()> {
    let filter = env::var("AEKO_EXPLORER_LOG_FILTER")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            env::var("RUST_LOG")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| DEFAULT_FILTER.to_string());
    let env_filter = EnvFilter::try_new(&filter)
        .with_context(|| format!("invalid Explorer log filter {filter:?}"))?;
    let format = env::var("AEKO_EXPLORER_LOG_FORMAT")
        .unwrap_or_else(|_| "json".to_string())
        .trim()
        .to_ascii_lowercase();

    let registry = tracing_subscriber::registry().with(env_filter);
    match format.as_str() {
        "json" => registry
            .with(
                fmt::layer()
                    .json()
                    .flatten_event(true)
                    .with_current_span(true)
                    .with_span_list(true)
                    .with_target(true),
            )
            .try_init()
            .context("installing Explorer JSON tracing subscriber")?,
        "text" | "compact" => registry
            .with(fmt::layer().compact().with_target(true))
            .try_init()
            .context("installing Explorer text tracing subscriber")?,
        other => anyhow::bail!(
            "AEKO_EXPLORER_LOG_FORMAT={other:?} must be json, text, or compact"
        ),
    }

    std::panic::set_hook(Box::new(|info| {
        let location = info.location();
        let message = if let Some(value) = info.payload().downcast_ref::<&str>() {
            (*value).to_string()
        } else if let Some(value) = info.payload().downcast_ref::<String>() {
            value.clone()
        } else {
            "non-string panic payload".to_string()
        };
        tracing::error!(
            service = SERVICE,
            panic.message = %message,
            panic.file = location.map(|value| value.file()).unwrap_or("unknown"),
            panic.line = location.map(|value| value.line()).unwrap_or(0),
            "Explorer process panicked"
        );
    }));

    tracing::info!(
        service = SERVICE,
        version = env!("CARGO_PKG_VERSION"),
        log.format = %format,
        log.filter = %filter,
        "Explorer application logging initialized"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::endpoint_origin;

    #[test]
    fn endpoint_origin_redacts_credentials_path_query_and_fragment() {
        let rendered = endpoint_origin(
            "https://operator:super-secret@rpc.example.com:8443/private/path?token=secret#fragment",
        );
        assert_eq!(rendered, "https://rpc.example.com:8443");
        assert!(!rendered.contains("operator"));
        assert!(!rendered.contains("super-secret"));
        assert!(!rendered.contains("token"));
    }

    #[test]
    fn endpoint_origin_does_not_echo_invalid_configuration() {
        assert_eq!(endpoint_origin("not a valid rpc url with secret=abc"), "[invalid endpoint]");
    }
}
