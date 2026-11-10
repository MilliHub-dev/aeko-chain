use {
    crate::{response, response::DataEnvelope, state::SharedState},
    aeko_sdk::{bpf_loader_upgradeable, pubkey::Pubkey},
    axum::{
        extract::State,
        http::StatusCode,
        response::{IntoResponse, Response},
        routing::{get, post},
        Json, Router,
    },
    serde::{Deserialize, Serialize},
    serde_json::{json, Value},
    std::{
        path::{Component, Path},
        str::FromStr,
    },
};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceFile {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EditorJobRequest {
    files: Vec<SourceFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProgramAddressRequest {
    program_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgramAddressView {
    program_id: String,
    program_data_address: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorCapabilities {
    enabled: bool,
    build_enabled: bool,
    test_enabled: bool,
    deploy_enabled: bool,
    upgrade_enabled: bool,
    mainnet_deploy_blocked: bool,
    max_files: usize,
    max_source_bytes: usize,
    job_timeout_seconds: u64,
    supported_frameworks: [&'static str; 1],
}

#[derive(Debug)]
struct EditorHttpError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl EditorHttpError {
    fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    fn unavailable(message: impl Into<String>) -> Self {
        Self::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "EDITOR_UNAVAILABLE",
            message,
        )
    }

    fn internal(error: impl std::fmt::Display) -> Self {
        tracing::error!(error = %error, "editor API failed internally");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "EDITOR_INTERNAL",
            "The AEKO editor service failed internally.",
        )
    }
}

impl IntoResponse for EditorHttpError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({
                "error": {
                    "code": self.code,
                    "message": self.message,
                }
            })),
        )
            .into_response()
    }
}

type EditorResult<T> = Result<T, EditorHttpError>;

pub fn router() -> Router<SharedState> {
    Router::new()
        .route("/editor/capabilities", get(capabilities))
        .route("/editor/build", post(build))
        .route("/editor/test", post(test))
        .route("/editor/program-data-address", post(program_data_address))
}

async fn capabilities(State(state): State<SharedState>) -> Json<DataEnvelope<EditorCapabilities>> {
    let runner_enabled = state.editor.runner_url.is_some();
    response::data_from_source(
        &state.network,
        EditorCapabilities {
            enabled: runner_enabled,
            build_enabled: runner_enabled,
            test_enabled: runner_enabled,
            deploy_enabled: runner_enabled && state.is_test_environment(),
            upgrade_enabled: runner_enabled && state.is_test_environment(),
            mainnet_deploy_blocked: true,
            max_files: state.editor.max_files,
            max_source_bytes: state.editor.max_source_bytes,
            job_timeout_seconds: state.editor.request_timeout.as_secs(),
            supported_frameworks: ["native-rust"],
        },
        "editor-control-plane",
    )
}

async fn build(
    State(state): State<SharedState>,
    Json(request): Json<EditorJobRequest>,
) -> EditorResult<Json<DataEnvelope<Value>>> {
    validate_request(&request, &state)?;
    proxy_job(&state, "build", request).await
}

async fn test(
    State(state): State<SharedState>,
    Json(request): Json<EditorJobRequest>,
) -> EditorResult<Json<DataEnvelope<Value>>> {
    validate_request(&request, &state)?;
    proxy_job(&state, "test", request).await
}

async fn program_data_address(
    State(state): State<SharedState>,
    Json(request): Json<ProgramAddressRequest>,
) -> EditorResult<Json<DataEnvelope<ProgramAddressView>>> {
    let program_id = Pubkey::from_str(request.program_id.trim()).map_err(|_| {
        EditorHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_PROGRAM_ID",
            "programId must be a valid AEKO public key.",
        )
    })?;
    let address = bpf_loader_upgradeable::get_program_data_address(&program_id);
    Ok(response::data_from_source(
        &state.network,
        ProgramAddressView {
            program_id: program_id.to_string(),
            program_data_address: address.to_string(),
        },
        "aeko-loader",
    ))
}

fn validate_request(request: &EditorJobRequest, state: &SharedState) -> EditorResult<()> {
    if state.editor.runner_url.is_none() {
        return Err(EditorHttpError::unavailable(
            "The isolated AEKO compiler runner is not configured.",
        ));
    }
    if request.files.is_empty() {
        return Err(EditorHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_PROJECT",
            "At least one Rust source file is required.",
        ));
    }
    if request.files.len() > state.editor.max_files {
        return Err(EditorHttpError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "PROJECT_TOO_LARGE",
            format!(
                "Project has {} files; maximum is {}.",
                request.files.len(),
                state.editor.max_files
            ),
        ));
    }

    let mut total = 0usize;
    let mut seen = std::collections::HashSet::new();
    let mut has_lib = false;
    for file in &request.files {
        let path = validate_source_path(&file.path)?;
        if !seen.insert(path.clone()) {
            return Err(EditorHttpError::new(
                StatusCode::BAD_REQUEST,
                "INVALID_PROJECT",
                format!("Duplicate source path: {}", file.path),
            ));
        }
        if path == Path::new("src/lib.rs") {
            has_lib = true;
        }
        total = total.saturating_add(file.content.len());
        if total > state.editor.max_source_bytes {
            return Err(EditorHttpError::new(
                StatusCode::PAYLOAD_TOO_LARGE,
                "PROJECT_TOO_LARGE",
                format!(
                    "Project source exceeds {} bytes.",
                    state.editor.max_source_bytes
                ),
            ));
        }
    }
    if !has_lib {
        return Err(EditorHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_PROJECT",
            "Project must include src/lib.rs.",
        ));
    }
    Ok(())
}

fn validate_source_path(raw: &str) -> EditorResult<std::path::PathBuf> {
    if raw.is_empty() || raw.len() > 240 || raw.contains('\0') || raw.contains('\\') {
        return Err(EditorHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_SOURCE_PATH",
            "Source path is invalid.",
        ));
    }
    let path = Path::new(raw);
    if path.is_absolute() {
        return Err(EditorHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_SOURCE_PATH",
            "Absolute source paths are not allowed.",
        ));
    }

    let mut depth = 0usize;
    for component in path.components() {
        match component {
            Component::Normal(_) => depth += 1,
            _ => {
                return Err(EditorHttpError::new(
                    StatusCode::BAD_REQUEST,
                    "INVALID_SOURCE_PATH",
                    "Source path traversal is not allowed.",
                ))
            }
        }
    }
    if depth < 2 || depth > 8 || path.extension().and_then(|value| value.to_str()) != Some("rs") {
        return Err(EditorHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_SOURCE_PATH",
            "Only Rust files under src/ or tests/ are supported.",
        ));
    }
    let allowed_root = matches!(
        path.components().next(),
        Some(Component::Normal(value)) if value == std::ffi::OsStr::new("src") || value == std::ffi::OsStr::new("tests")
    );
    if !allowed_root {
        return Err(EditorHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_SOURCE_PATH",
            "Only Rust files under src/ or tests/ are supported.",
        ));
    }
    Ok(path.to_path_buf())
}

async fn proxy_job(
    state: &SharedState,
    action: &'static str,
    request: EditorJobRequest,
) -> EditorResult<Json<DataEnvelope<Value>>> {
    let base = state.editor.runner_url.as_deref().ok_or_else(|| {
        EditorHttpError::unavailable("The isolated AEKO compiler runner is not configured.")
    })?;
    let url = format!("{}/v1/{action}", base.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(state.editor.request_timeout)
        .build()
        .map_err(EditorHttpError::internal)?;
    let response = client
        .post(url)
        .json(&request)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                EditorHttpError::new(
                    StatusCode::GATEWAY_TIMEOUT,
                    "EDITOR_RUNNER_TIMEOUT",
                    "The AEKO compiler runner did not respond before the API timeout.",
                )
            } else {
                EditorHttpError::unavailable("The isolated AEKO compiler runner is unavailable.")
            }
        })?;
    let status = response.status();
    let payload: Value = response.json().await.map_err(EditorHttpError::internal)?;

    if !status.is_success() {
        let message = payload
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("The isolated AEKO compiler runner rejected the job.")
            .to_string();
        let code = match status.as_u16() {
            400 => "INVALID_PROJECT",
            413 => "PROJECT_TOO_LARGE",
            429 => "EDITOR_RUNNER_BUSY",
            503 => "EDITOR_UNAVAILABLE",
            504 => "EDITOR_RUNNER_TIMEOUT",
            _ => "EDITOR_RUNNER_ERROR",
        };
        return Err(EditorHttpError::new(
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            code,
            message,
        ));
    }

    Ok(response::data_from_source(
        &state.network,
        payload,
        "isolated-editor-runner",
    ))
}

#[cfg(test)]
mod tests {
    use super::validate_source_path;

    #[test]
    fn editor_paths_are_strictly_scoped_to_rust_sources() {
        assert!(validate_source_path("src/lib.rs").is_ok());
        assert!(validate_source_path("src/state/mod.rs").is_ok());
        assert!(validate_source_path("tests/smoke.rs").is_ok());

        assert!(validate_source_path("../Cargo.toml").is_err());
        assert!(validate_source_path("/tmp/lib.rs").is_err());
        assert!(validate_source_path("src/build.sh").is_err());
        assert!(validate_source_path("Cargo.toml").is_err());
        assert!(validate_source_path("vendor/lib.rs").is_err());
    }
}
