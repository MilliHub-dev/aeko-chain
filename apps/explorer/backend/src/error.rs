//! Error type that flows through every Axum handler.
//!
//! Handlers return `Result<_, ApiError>`. `ApiError::into_response` builds the
//! `{"error": {"code", "message"}}` JSON envelope that the web UI already
//! expects (kept identical to the pre-axum hyper layer for backward compat).

use {
    axum::{
        http::StatusCode,
        response::{IntoResponse, Response},
        Json,
    },
    serde_json::json,
};

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("{0} not found")]
    NotFound(&'static str),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl ApiError {
    fn status(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "bad_request",
            Self::NotFound(_) => "not_found",
            Self::Internal(_) => "internal_error",
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        let code = self.code();
        // Log every 5xx with stack of causes; 4xx logs at debug.
        if status.is_server_error() {
            tracing::error!(error.code = code, error.message = %self, "request failed");
        } else {
            tracing::debug!(error.code = code, error.message = %self, "request rejected");
        }
        let body = Json(json!({
            "error": {
                "code": code,
                "message": self.to_string(),
            }
        }));
        (status, body).into_response()
    }
}

/// Convenience alias for handler return types.
pub type ApiResult<T> = Result<T, ApiError>;
