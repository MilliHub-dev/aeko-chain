#[tokio::main]
async fn main() -> anyhow::Result<()> {
    aeko_explorer_backend::bootstrap::run().await
}
