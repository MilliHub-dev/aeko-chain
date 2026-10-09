use {
    axum::{
        extract::{DefaultBodyLimit, State},
        http::StatusCode,
        response::{IntoResponse, Response},
        routing::{get, post},
        Json, Router,
    },
    base64::{engine::general_purpose::STANDARD as BASE64, Engine},
    serde::{Deserialize, Serialize},
    serde_json::json,
    sha2::{Digest, Sha256},
    std::{
        env,
        fs::File,
        io::{Read, Write},
        net::SocketAddr,
        path::{Component, Path, PathBuf},
        process::Stdio,
        sync::Arc,
        time::{Duration, Instant},
    },
    tempfile::Builder,
    tokio::{net::TcpListener, process::Command, sync::Semaphore},
    tower_http::{limit::RequestBodyLimitLayer, trace::TraceLayer},
};

#[derive(Clone, Debug)]
struct RunnerConfig {
    bind: SocketAddr,
    repo_root: PathBuf,
    work_root: PathBuf,
    max_files: usize,
    max_source_bytes: usize,
    max_output_bytes: usize,
    max_artifact_bytes: usize,
    timeout: Duration,
    concurrency: usize,
}

impl RunnerConfig {
    fn from_env() -> Result<Self, String> {
        let bind = required("AEKO_EDITOR_RUNNER_BIND")?
            .parse()
            .map_err(|error| format!("AEKO_EDITOR_RUNNER_BIND is invalid: {error}"))?;
        let repo_root = canonical_directory("AEKO_EDITOR_REPO_ROOT")?;
        let work_root = canonical_directory("AEKO_EDITOR_WORK_ROOT")?;
        let max_files = positive_usize("AEKO_EDITOR_MAX_FILES")?;
        let max_source_bytes = positive_usize("AEKO_EDITOR_MAX_SOURCE_BYTES")?;
        let max_output_bytes = positive_usize("AEKO_EDITOR_MAX_OUTPUT_BYTES")?;
        let max_artifact_bytes = positive_usize("AEKO_EDITOR_MAX_ARTIFACT_BYTES")?;
        let timeout = Duration::from_secs(positive_u64("AEKO_EDITOR_JOB_TIMEOUT_SECS")?);
        let concurrency = positive_usize("AEKO_EDITOR_MAX_CONCURRENCY")?;

        Ok(Self {
            bind,
            repo_root,
            work_root,
            max_files,
            max_source_bytes,
            max_output_bytes,
            max_artifact_bytes,
            timeout,
            concurrency,
        })
    }
}

fn required(key: &str) -> Result<String, String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("required environment variable {key} is missing or empty"))
}

fn positive_usize(key: &str) -> Result<usize, String> {
    let value = required(key)?;
    let parsed = value
        .parse::<usize>()
        .map_err(|error| format!("{key} is invalid: {error}"))?;
    if parsed == 0 {
        return Err(format!("{key} must be greater than zero"));
    }
    Ok(parsed)
}

fn positive_u64(key: &str) -> Result<u64, String> {
    let value = required(key)?;
    let parsed = value
        .parse::<u64>()
        .map_err(|error| format!("{key} is invalid: {error}"))?;
    if parsed == 0 {
        return Err(format!("{key} must be greater than zero"));
    }
    Ok(parsed)
}

fn canonical_directory(key: &str) -> Result<PathBuf, String> {
    let value = PathBuf::from(required(key)?);
    let path = value
        .canonicalize()
        .map_err(|error| format!("{key} does not resolve to a directory: {error}"))?;
    if !path.is_dir() {
        return Err(format!("{key} must point to a directory"));
    }
    Ok(path)
}

#[derive(Clone)]
struct RunnerState {
    config: RunnerConfig,
    permits: Arc<Semaphore>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceFile {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JobRequest {
    files: Vec<SourceFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Artifact {
    name: String,
    sha256: String,
    byte_length: usize,
    base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Diagnostic {
    level: &'static str,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobResponse {
    status: &'static str,
    source_hash: String,
    elapsed_ms: u128,
    stdout: String,
    stderr: String,
    diagnostics: Vec<Diagnostic>,
    artifact: Option<Artifact>,
    test_summary: Option<TestSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TestSummary {
    passed: usize,
    failed: usize,
}

#[derive(Debug)]
struct RunnerError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl RunnerError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "INVALID_PROJECT",
            message: message.into(),
        }
    }

    fn busy() -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            code: "RUNNER_BUSY",
            message: "The build runner is at capacity. Retry shortly.".to_string(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "RUNNER_INTERNAL",
            message: message.into(),
        }
    }
}

impl IntoResponse for RunnerError {
    fn into_response(self) -> Response {
        if self.status.is_server_error() {
            tracing::error!(code = self.code, error = %self.message, "editor runner request failed");
        }
        (
            self.status,
            Json(json!({
                "error": {
                    "code": self.code,
                    "message": if self.status.is_server_error() {
                        "The isolated build runner failed internally."
                    } else {
                        &self.message
                    }
                }
            })),
        )
            .into_response()
    }
}

#[derive(Debug)]
struct ProcessOutput {
    status: std::process::ExitStatus,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .json()
        .init();

    let config = match RunnerConfig::from_env() {
        Ok(value) => value,
        Err(error) => {
            tracing::error!(error = %error, "invalid editor runner configuration");
            std::process::exit(2);
        }
    };
    let bind = config.bind;
    let body_limit = config.max_source_bytes.saturating_add(64 * 1024);
    let state = Arc::new(RunnerState {
        permits: Arc::new(Semaphore::new(config.concurrency)),
        config,
    });

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/v1/build", post(build))
        .route("/v1/test", post(test))
        .with_state(state)
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(body_limit))
        .layer(TraceLayer::new_for_http());

    let listener = match TcpListener::bind(bind).await {
        Ok(value) => value,
        Err(error) => {
            tracing::error!(%error, %bind, "failed to bind editor runner");
            std::process::exit(2);
        }
    };
    tracing::info!(%bind, "AEKO editor runner ready");

    if let Err(error) = axum::serve(listener, app).await {
        tracing::error!(%error, "editor runner stopped");
        std::process::exit(1);
    }
}

async fn build(
    State(state): State<Arc<RunnerState>>,
    Json(request): Json<JobRequest>,
) -> Result<Json<JobResponse>, RunnerError> {
    execute_job(state, request, JobKind::Build).await.map(Json)
}

async fn test(
    State(state): State<Arc<RunnerState>>,
    Json(request): Json<JobRequest>,
) -> Result<Json<JobResponse>, RunnerError> {
    execute_job(state, request, JobKind::Test).await.map(Json)
}

#[derive(Clone, Copy)]
enum JobKind {
    Build,
    Test,
}

async fn execute_job(
    state: Arc<RunnerState>,
    request: JobRequest,
    kind: JobKind,
) -> Result<JobResponse, RunnerError> {
    let _permit = state
        .permits
        .clone()
        .try_acquire_owned()
        .map_err(|_| RunnerError::busy())?;
    validate_files(&request.files, &state.config)?;
    let source_hash = hash_sources(&request.files);
    let started = Instant::now();

    let temp = Builder::new()
        .prefix("aeko-editor-")
        .tempdir_in(&state.config.work_root)
        .map_err(|error| RunnerError::internal(format!("creating workspace: {error}")))?;
    let root = temp.path();

    write_project(root, &state.config.repo_root, &request.files)?;
    let output = match kind {
        JobKind::Build => run_build(root, &state.config).await?,
        JobKind::Test => run_tests(root, &state.config).await?,
    };

    let diagnostics = diagnostics_from(&output.stderr);
    let artifact = if matches!(kind, JobKind::Build) && output.status.success() && !output.timed_out
    {
        Some(read_artifact(root, state.config.max_artifact_bytes)?)
    } else {
        None
    };
    let test_summary = matches!(kind, JobKind::Test)
        .then(|| summarize_tests(&output.stdout, output.status.success()));

    Ok(JobResponse {
        status: if output.timed_out {
            "timed_out"
        } else if output.status.success() {
            "succeeded"
        } else {
            "failed"
        },
        source_hash,
        elapsed_ms: started.elapsed().as_millis(),
        stdout: output.stdout,
        stderr: output.stderr,
        diagnostics,
        artifact,
        test_summary,
    })
}

fn validate_files(files: &[SourceFile], config: &RunnerConfig) -> Result<(), RunnerError> {
    if files.is_empty() {
        return Err(RunnerError::bad_request(
            "At least one Rust source file is required.",
        ));
    }
    if files.len() > config.max_files {
        return Err(RunnerError::bad_request(format!(
            "Project has {} files; maximum is {}.",
            files.len(),
            config.max_files
        )));
    }

    let mut total = 0usize;
    let mut seen = std::collections::HashSet::new();
    let mut has_lib = false;
    for file in files {
        let path = validate_relative_rust_path(&file.path)?;
        if !seen.insert(path.clone()) {
            return Err(RunnerError::bad_request(format!(
                "Duplicate source path: {}",
                file.path
            )));
        }
        if path == Path::new("src/lib.rs") {
            has_lib = true;
        }
        total = total.saturating_add(file.content.len());
        if total > config.max_source_bytes {
            return Err(RunnerError::bad_request(format!(
                "Project source exceeds {} bytes.",
                config.max_source_bytes
            )));
        }
    }
    if !has_lib {
        return Err(RunnerError::bad_request("Project must include src/lib.rs."));
    }
    Ok(())
}

fn validate_relative_rust_path(raw: &str) -> Result<PathBuf, RunnerError> {
    if raw.is_empty() || raw.len() > 240 || raw.contains('\0') || raw.contains('\\') {
        return Err(RunnerError::bad_request("Source path is invalid."));
    }
    let path = Path::new(raw);
    if path.is_absolute() {
        return Err(RunnerError::bad_request(
            "Absolute source paths are not allowed.",
        ));
    }

    let mut depth = 0usize;
    for component in path.components() {
        match component {
            Component::Normal(_) => depth += 1,
            _ => {
                return Err(RunnerError::bad_request(
                    "Source path traversal is not allowed.",
                ))
            }
        }
    }
    if !(2..=8).contains(&depth)
        || path.extension().and_then(|value| value.to_str()) != Some("rs")
    {
        return Err(RunnerError::bad_request(
            "Only Rust files under src/ or tests/ are supported.",
        ));
    }
    let first = path.components().next();
    let allowed_root = matches!(
        first,
        Some(Component::Normal(value)) if value == std::ffi::OsStr::new("src") || value == std::ffi::OsStr::new("tests")
    );
    if !allowed_root {
        return Err(RunnerError::bad_request(
            "Only Rust files under src/ or tests/ are supported.",
        ));
    }
    Ok(path.to_path_buf())
}

fn hash_sources(files: &[SourceFile]) -> String {
    let mut ordered = files.iter().collect::<Vec<_>>();
    ordered.sort_by(|left, right| left.path.cmp(&right.path));
    let mut hasher = Sha256::new();
    for file in ordered {
        hasher.update(file.path.as_bytes());
        hasher.update([0]);
        hasher.update(file.content.as_bytes());
        hasher.update([0xff]);
    }
    hex(&hasher.finalize())
}

fn write_project(root: &Path, repo_root: &Path, files: &[SourceFile]) -> Result<(), RunnerError> {
    for file in files {
        let relative = validate_relative_rust_path(&file.path)?;
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                RunnerError::internal(format!("creating source directory: {error}"))
            })?;
        }
        let mut output = File::create(&path)
            .map_err(|error| RunnerError::internal(format!("creating source file: {error}")))?;
        output
            .write_all(file.content.as_bytes())
            .map_err(|error| RunnerError::internal(format!("writing source file: {error}")))?;
    }

    let program_path = repo_root.join("sdk/program");
    let manifest = format!(
        "[package]\nname = \"aeko_editor_program\"\nversion = \"0.1.0\"\nedition = \"2021\"\npublish = false\n\n[lib]\ncrate-type = [\"cdylib\", \"lib\"]\nname = \"aeko_editor_program\"\n\n[dependencies]\naeko-program = {{ path = {:?} }}\n",
        program_path
    );
    std::fs::write(root.join("Cargo.toml"), manifest)
        .map_err(|error| RunnerError::internal(format!("writing generated manifest: {error}")))?;
    Ok(())
}

async fn run_build(root: &Path, config: &RunnerConfig) -> Result<ProcessOutput, RunnerError> {
    let out_dir = root.join("out");
    std::fs::create_dir_all(&out_dir)
        .map_err(|error| RunnerError::internal(format!("creating artifact directory: {error}")))?;
    let builder = config.repo_root.join("cargo-build-sbf");
    let args = vec![
        builder.to_string_lossy().to_string(),
        "--manifest-path".to_string(),
        root.join("Cargo.toml").to_string_lossy().to_string(),
        "--sbf-out-dir".to_string(),
        out_dir.to_string_lossy().to_string(),
    ];
    run_bounded("/usr/bin/env", &args, root, config).await
}

async fn run_tests(root: &Path, config: &RunnerConfig) -> Result<ProcessOutput, RunnerError> {
    let args = vec![
        "cargo".to_string(),
        "test".to_string(),
        "--offline".to_string(),
        "--manifest-path".to_string(),
        root.join("Cargo.toml").to_string_lossy().to_string(),
        "--".to_string(),
        "--test-threads=1".to_string(),
    ];
    run_bounded("/usr/bin/env", &args, root, config).await
}

async fn run_bounded(
    program: &str,
    args: &[String],
    root: &Path,
    config: &RunnerConfig,
) -> Result<ProcessOutput, RunnerError> {
    let stdout_path = root.join("stdout.log");
    let stderr_path = root.join("stderr.log");
    let stdout = File::create(&stdout_path)
        .map_err(|error| RunnerError::internal(format!("creating stdout log: {error}")))?;
    let stderr = File::create(&stderr_path)
        .map_err(|error| RunnerError::internal(format!("creating stderr log: {error}")))?;

    let timeout_seconds = config.timeout.as_secs().to_string();
    let mut command = Command::new("/usr/bin/timeout");
    command
        .arg("--signal=KILL")
        .arg("--kill-after=5s")
        .arg(&timeout_seconds)
        .arg(program)
        .args(args)
        .current_dir(root)
        .env("CARGO_NET_OFFLINE", "true")
        .env("RUSTC_WRAPPER", "")
        .env("CARGO_TERM_COLOR", "never")
        .env("RUST_BACKTRACE", "0")
        .env("CARGO_TARGET_DIR", root.join("target"))
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .kill_on_drop(true);

    let status = command.status().await.map_err(|error| {
        RunnerError::internal(format!("starting bounded toolchain job: {error}"))
    })?;
    let timed_out = matches!(status.code(), Some(124 | 137));
    Ok(ProcessOutput {
        status,
        stdout: read_capped(&stdout_path, config.max_output_bytes)?,
        stderr: read_capped(&stderr_path, config.max_output_bytes)?,
        timed_out,
    })
}

fn read_capped(path: &Path, max: usize) -> Result<String, RunnerError> {
    let file = File::open(path)
        .map_err(|error| RunnerError::internal(format!("reading job output: {error}")))?;
    let mut bytes = Vec::with_capacity(max.min(64 * 1024));
    file.take(max as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| RunnerError::internal(format!("reading job output: {error}")))?;
    let mut output = String::from_utf8_lossy(&bytes).to_string();
    let full_len = std::fs::metadata(path)
        .map(|value| value.len() as usize)
        .unwrap_or(bytes.len());
    if full_len > bytes.len() {
        output.push_str("\n[output truncated by AEKO editor runner]\n");
    }
    Ok(output)
}

fn read_artifact(root: &Path, max: usize) -> Result<Artifact, RunnerError> {
    let path = root.join("out/aeko_editor_program.so");
    let bytes = std::fs::read(&path)
        .map_err(|error| RunnerError::internal(format!("reading SBF artifact: {error}")))?;
    if bytes.is_empty() || bytes.len() > max {
        return Err(RunnerError::internal(format!(
            "SBF artifact size {} is outside the allowed range",
            bytes.len()
        )));
    }
    let sha256 = hex(&Sha256::digest(&bytes));
    Ok(Artifact {
        name: "aeko_editor_program.so".to_string(),
        sha256,
        byte_length: bytes.len(),
        base64: BASE64.encode(bytes),
    })
}

fn diagnostics_from(stderr: &str) -> Vec<Diagnostic> {
    stderr
        .lines()
        .filter(|line| {
            let value = line.trim_start();
            value.starts_with("error") || value.starts_with("warning")
        })
        .take(100)
        .map(|line| Diagnostic {
            level: if line.trim_start().starts_with("error") {
                "error"
            } else {
                "warning"
            },
            message: line.trim().to_string(),
        })
        .collect()
}

fn summarize_tests(stdout: &str, success: bool) -> TestSummary {
    let mut passed = 0usize;
    let mut failed = 0usize;
    for line in stdout.lines() {
        if let Some(rest) = line.trim().strip_prefix("test result:") {
            for token in rest.split(';') {
                let value = token.trim();
                if let Some(number) = value.strip_suffix(" passed") {
                    passed = passed.saturating_add(number.trim().parse::<usize>().unwrap_or(0));
                }
                if let Some(number) = value.strip_suffix(" failed") {
                    failed = failed.saturating_add(number.trim().parse::<usize>().unwrap_or(0));
                }
            }
        }
    }
    if !success && failed == 0 {
        failed = 1;
    }
    TestSummary { passed, failed }
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::{hash_sources, validate_relative_rust_path, SourceFile};

    #[test]
    fn source_paths_reject_traversal_and_non_rust_files() {
        assert!(validate_relative_rust_path("src/lib.rs").is_ok());
        assert!(validate_relative_rust_path("tests/smoke.rs").is_ok());
        assert!(validate_relative_rust_path("../Cargo.toml").is_err());
        assert!(validate_relative_rust_path("/tmp/lib.rs").is_err());
        assert!(validate_relative_rust_path("src/build.sh").is_err());
        assert!(validate_relative_rust_path("vendor/lib.rs").is_err());
    }

    #[test]
    fn source_hash_is_stable_across_file_order() {
        let left = vec![
            SourceFile {
                path: "src/lib.rs".into(),
                content: "pub fn a() {}".into(),
            },
            SourceFile {
                path: "tests/a.rs".into(),
                content: "#[test] fn a() {}".into(),
            },
        ];
        let right = vec![
            SourceFile {
                path: "tests/a.rs".into(),
                content: "#[test] fn a() {}".into(),
            },
            SourceFile {
                path: "src/lib.rs".into(),
                content: "pub fn a() {}".into(),
            },
        ];
        assert_eq!(hash_sources(&left), hash_sources(&right));
    }
}
