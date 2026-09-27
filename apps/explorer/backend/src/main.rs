use {
    aeko_explorer_backend::{bootstrap, observability, ExplorerBackendConfig, RpcChainClient},
    anyhow::Context,
};

fn main() -> anyhow::Result<()> {
    observability::init().context("initializing Explorer application logging")?;

    let result = run();
    if let Err(error) = &result {
        tracing::error!(error = ?error, "Explorer process terminated with an error");
    }
    result
}

fn run() -> anyhow::Result<()> {
    // reqwest::blocking owns an internal Tokio runtime and must not be created
    // or last-dropped from within another async runtime. Keep one owner in this
    // synchronous scope for the entire Explorer process lifetime; async code
    // receives a clone and performs every blocking RPC call on spawn_blocking.
    let backend =
        ExplorerBackendConfig::from_env().context("loading Explorer backend environment")?;
    tracing::info!(network = %backend.network, "Explorer runtime configuration loaded");
    let rpc_owner = RpcChainClient::new(backend).context("initializing validator RPC client")?;
    let rpc = rpc_owner.clone();

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("building Explorer Tokio runtime")?;
    let result = runtime.block_on(bootstrap::run(rpc));

    // Drop the application runtime before the final blocking-client owner so
    // reqwest can shut down its internal runtime from a synchronous context.
    drop(runtime);
    drop(rpc_owner);
    result
}
