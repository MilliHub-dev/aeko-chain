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
    #[error("unauthorized")]
    Unauthorized,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl ApiError {
    fn status(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            Self::BadRequest(_) => "bad_request",
            Self::NotFound(_) => "not_found",
            Self::Unauthorized => "unauthorized",
            Self::Conflict(_) => "conflict",
            Self::Internal(_) => "internal_error",
        }
    }

    fn public_message(&self) -> String {
        match self {
            Self::Internal(_) => "internal server error".to_string(),
            _ => self.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        let code = self.code();
        if status.is_server_error() {
            tracing::error!(error.code = code, error = ?self, "request failed");
        } else {
            tracing::debug!(error.code = code, error = %self, "request rejected");
        }
        let body = Json(json!({
            "error": {
                "code": code,
                "message": self.public_message(),
            }
        }));
        (status, body).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
