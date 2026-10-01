use {
    super::{FundingHttpError, FundingResult, ADMIN_HEADER},
    crate::state::SharedState,
    aeko_sdk::{native_token::LAMPORTS_PER_AEKO, pubkey::Pubkey},
    axum::http::{HeaderMap, StatusCode},
};

const FUNDING_RATE_WINDOW_SECONDS: i32 = 600;

pub(super) async fn apply_rate_limit(
    state: &SharedState,
    headers: &HeaderMap,
    scope: &str,
) -> FundingResult<()> {
    let subject = requester_subject(headers);
    state
        .repository
        .record_funding_rate_event(
            scope,
            &subject,
            i64::from(state.funding_requests_per_10_min),
            FUNDING_RATE_WINDOW_SECONDS,
        )
        .await?;
    Ok(())
}

pub(super) async fn apply_subject_rate_limit(
    state: &SharedState,
    scope: &str,
    subject: &str,
) -> FundingResult<()> {
    state
        .repository
        .record_funding_rate_event(
            scope,
            subject,
            i64::from(state.funding_requests_per_10_min),
            FUNDING_RATE_WINDOW_SECONDS,
        )
        .await?;
    Ok(())
}

fn requester_subject(headers: &HeaderMap) -> String {
    for name in ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] {
        if let Some(value) = headers.get(name).and_then(|value| value.to_str().ok()) {
            let first = value.split(',').next().unwrap_or_default().trim();
            if !first.is_empty() {
                return first.chars().take(128).collect();
            }
        }
    }
    "unknown".to_string()
}

pub(super) fn ensure_funding_available(_state: &SharedState) -> FundingResult<()> {
    // Funding is available on every configured deployment. Developer airdrop
    // availability is a separate policy boundary enforced below; Mainnet
    // rejects that utility while public/Admin Funding remains available.
    Ok(())
}

pub(super) fn ensure_developer_airdrop_available(state: &SharedState) -> FundingResult<()> {
    if state.is_test_environment() {
        return Ok(());
    }
    Err(FundingHttpError::new(
        StatusCode::FORBIDDEN,
        "AIRDROP_DISABLED_ON_MAINNET",
        "Developer airdrop is disabled on mainnet",
    ))
}

pub(super) fn authorize_admin(headers: &HeaderMap, expected: &str) -> FundingResult<()> {
    let supplied = headers
        .get(ADMIN_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if constant_time_equal(supplied.as_bytes(), expected.as_bytes()) {
        Ok(())
    } else {
        Err(FundingHttpError::new(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Unauthorized",
        ))
    }
}

pub(super) fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}

pub(super) fn validate_address(value: &str) -> FundingResult<String> {
    let trimmed = value.trim();
    trimmed.parse::<Pubkey>().map_err(|_| {
        FundingHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_ADDRESS",
            "Enter a valid AEKO wallet address",
        )
    })?;
    Ok(trimmed.to_string())
}

pub(super) fn validate_positive(value: Option<f64>, name: &str) -> FundingResult<()> {
    if let Some(value) = value {
        if !value.is_finite() || value <= 0.0 {
            return Err(FundingHttpError::new(
                StatusCode::BAD_REQUEST,
                "INVALID_SETTING",
                format!("{name} must be a positive finite number"),
            ));
        }
    }
    Ok(())
}

pub(super) fn validate_non_negative(value: Option<f64>, name: &str) -> FundingResult<()> {
    if let Some(value) = value {
        if !value.is_finite() || value < 0.0 {
            return Err(FundingHttpError::new(
                StatusCode::BAD_REQUEST,
                "INVALID_SETTING",
                format!("{name} must be a non-negative finite number"),
            ));
        }
    }
    Ok(())
}

pub(super) fn validate_direct_amount(amount: f64, cap: f64, label: &str) -> FundingResult<()> {
    if !amount.is_finite() || amount <= 0.0 {
        return Err(FundingHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_AMOUNT",
            "Amount must be greater than zero",
        ));
    }
    if amount > cap {
        return Err(FundingHttpError::new(
            StatusCode::BAD_REQUEST,
            "AMOUNT_TOO_LARGE",
            format!("{label} cannot exceed {cap} AEKO per request"),
        ));
    }
    Ok(())
}

pub(super) fn amount_to_lamports(amount_aeko: f64) -> FundingResult<u64> {
    let lamports = amount_aeko * LAMPORTS_PER_AEKO as f64;
    if !lamports.is_finite() || lamports < 1.0 || lamports > u64::MAX as f64 {
        return Err(FundingHttpError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_AMOUNT",
            "Funding amount cannot be represented in lamports",
        ));
    }
    Ok(lamports.round() as u64)
}
