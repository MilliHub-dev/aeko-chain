use {
    super::{guards::amount_to_lamports, FundingHttpError, FundingResult},
    crate::{
        infrastructure::{
            chain::FundingTransferStatus,
            persistence::funding::{
                FundingAirdropRecord, FundingRequestRecord, FundingStoreError,
            },
        },
        state::SharedState,
    },
    axum::http::StatusCode,
    std::time::Duration,
};

const CONFIRMATION_ATTEMPTS: u32 = 12;
const CONFIRMATION_INTERVAL_MS: u64 = 500;

async fn prepare_funding_submission_intent(
    state: &SharedState,
    request: FundingRequestRecord,
) -> FundingResult<FundingRequestRecord> {
    if request.status != "processing" || request.signature.is_some() {
        return Err(FundingHttpError::from(
            FundingStoreError::RequestAlreadyDecided {
                status: request.status,
            },
        ));
    }
    if request.submission_blockhash.is_some() {
        return Ok(request);
    }

    let rpc = state.rpc.clone();
    let blockhash = match tokio::task::spawn_blocking(move || rpc.latest_funding_blockhash()).await
    {
        Ok(Ok(blockhash)) => blockhash,
        Ok(Err(error)) => {
            if request.source == "public" {
                state
                    .repository
                    .reset_public_request_before_submission(
                        &request.id,
                        "FUNDING_BLOCKHASH_UNAVAILABLE",
                        &error.to_string(),
                    )
                    .await?;
            } else {
                state
                    .repository
                    .mark_funding_request_failed(
                        &request.id,
                        "FUNDING_BLOCKHASH_UNAVAILABLE",
                        &error.to_string(),
                    )
                    .await?;
            }
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "FUNDING_BLOCKHASH_UNAVAILABLE",
                "A chain blockhash could not be obtained before funding submission; no transfer was attempted.",
            ));
        }
        Err(error) => {
            if request.source == "public" {
                state
                    .repository
                    .reset_public_request_before_submission(
                        &request.id,
                        "FUNDING_BLOCKHASH_UNAVAILABLE",
                        &error.to_string(),
                    )
                    .await?;
            } else {
                state
                    .repository
                    .mark_funding_request_failed(
                        &request.id,
                        "FUNDING_BLOCKHASH_UNAVAILABLE",
                        &error.to_string(),
                    )
                    .await?;
            }
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "FUNDING_BLOCKHASH_UNAVAILABLE",
                "The blockhash worker ended before funding submission; no transfer was attempted.",
            ));
        }
    };

    Ok(state
        .repository
        .set_funding_request_submission_blockhash(&request.id, &blockhash)
        .await?)
}

pub(super) async fn submit_and_observe_funding(
    state: &SharedState,
    request: FundingRequestRecord,
) -> FundingResult<FundingRequestRecord> {
    let request = prepare_funding_submission_intent(state, request).await?;
    let blockhash = request.submission_blockhash.clone().ok_or_else(|| {
        FundingHttpError::internal("processing funding request has no durable submission blockhash")
    })?;
    let lamports = amount_to_lamports(request.amount_aeko)?;
    let rpc = state.rpc.clone();
    let address = request.address.clone();
    let authorization = state.funding_authorization_key.clone();
    let submit_blockhash = blockhash.clone();
    let submit = tokio::task::spawn_blocking(move || {
        rpc.request_funding_transfer(
            &address,
            lamports,
            authorization.as_deref(),
            Some(&submit_blockhash),
        )
    })
    .await;

    let signature = match submit {
        Ok(Ok(signature)) => signature,
        Ok(Err(error)) => {
            tracing::warn!(
                request_id = %request.id,
                error = %error,
                "funding submission produced no durable transaction signature; persisted intent remains recoverable"
            );
            state
                .repository
                .mark_funding_request_submission_error(
                    &request.id,
                    "FUNDING_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "FUNDING_SUBMISSION_RETRY_PENDING",
                format!(
                    "The funding submission response was not obtained ({error}). The persisted transaction intent was kept and will be safely replayed with the same blockhash; no duplicate funding transfer will be created. Wait a few seconds then call reconcile, or wait for the background reconciler."
                ),
            ));
        }
        Err(error) => {
            state
                .repository
                .mark_funding_request_submission_error(
                    &request.id,
                    "FUNDING_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "FUNDING_SUBMISSION_RETRY_PENDING",
                format!(
                    "The funding submission worker ended unexpectedly ({error}). The persisted transaction intent was kept and will be safely replayed; no duplicate funding transfer will be created. Reconcile the request to resume."
                ),
            ));
        }
    };

    let submitted = state
        .repository
        .set_funding_request_signature(&request.id, &signature)
        .await?;
    tracing::info!(
        request_id = %request.id,
        signature = %signature,
        "submission returned a durable signature; confirmation continues in the reconciler"
    );
    Ok(submitted)
}

pub(super) async fn observe_funding(
    state: &SharedState,
    request: FundingRequestRecord,
) -> FundingResult<FundingRequestRecord> {
    if request.status == "confirmed" {
        return Ok(request);
    }
    if request.status != "submitted" {
        return Err(FundingHttpError::from(
            FundingStoreError::RequestAlreadyDecided {
                status: request.status,
            },
        ));
    }
    let signature = request.signature.clone().ok_or_else(|| {
        FundingHttpError::internal("submitted funding request has no durable transaction signature")
    })?;

    let rpc = state.rpc.clone();
    let signature_for_wait = signature.clone();
    let blockhash_for_wait = request.submission_blockhash.clone();
    let observation = tokio::task::spawn_blocking(move || {
        rpc.wait_for_funding_transfer_with_blockhash(
            &signature_for_wait,
            blockhash_for_wait.as_deref(),
            CONFIRMATION_ATTEMPTS,
            Duration::from_millis(CONFIRMATION_INTERVAL_MS),
        )
    })
    .await;

    match observation {
        Ok(Ok(FundingTransferStatus::Confirmed)) => Ok(state
            .repository
            .confirm_funding_request(&request.id)
            .await?),
        Ok(Ok(FundingTransferStatus::Failed(error))) => {
            state
                .repository
                .mark_funding_request_failed(&request.id, "FUNDING_TRANSACTION_FAILED", &error)
                .await?;
            Err(FundingHttpError::new(
                StatusCode::BAD_GATEWAY,
                "FUNDING_TRANSACTION_FAILED",
                format!("Funding transaction {signature} failed on-chain"),
            ))
        }
        Ok(Ok(FundingTransferStatus::Pending)) => Ok(state
            .repository
            .mark_funding_request_observation_error(
                &request.id,
                "FUNDING_CONFIRMATION_PENDING",
                "Transaction was submitted and is still awaiting chain confirmation",
            )
            .await?),
        Ok(Err(error)) => {
            tracing::warn!(
                request_id = %request.id,
                signature = %signature,
                error = %error,
                "funding transaction was submitted but confirmation polling failed"
            );
            Ok(state
                .repository
                .mark_funding_request_observation_error(
                    &request.id,
                    "FUNDING_CONFIRMATION_UNAVAILABLE",
                    &error.to_string(),
                )
                .await?)
        }
        Err(error) => {
            tracing::warn!(
                request_id = %request.id,
                signature = %signature,
                error = %error,
                "funding confirmation worker ended unexpectedly"
            );
            Ok(state
                .repository
                .mark_funding_request_observation_error(
                    &request.id,
                    "FUNDING_CONFIRMATION_UNAVAILABLE",
                    &error.to_string(),
                )
                .await?)
        }
    }
}

async fn prepare_airdrop_submission_intent(
    state: &SharedState,
    airdrop: FundingAirdropRecord,
) -> FundingResult<FundingAirdropRecord> {
    if airdrop.status != "processing" || airdrop.signature.is_some() {
        return Err(FundingHttpError::from(
            FundingStoreError::RequestAlreadyDecided {
                status: airdrop.status,
            },
        ));
    }
    if airdrop.submission_blockhash.is_some() {
        return Ok(airdrop);
    }

    let rpc = state.rpc.clone();
    let blockhash = match tokio::task::spawn_blocking(move || rpc.latest_funding_blockhash()).await
    {
        Ok(Ok(blockhash)) => blockhash,
        Ok(Err(error)) => {
            state
                .repository
                .mark_funding_airdrop_failed(
                    &airdrop.id,
                    "AIRDROP_BLOCKHASH_UNAVAILABLE",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "AIRDROP_BLOCKHASH_UNAVAILABLE",
                "A chain blockhash could not be obtained before the developer airdrop; no transfer was attempted.",
            ));
        }
        Err(error) => {
            state
                .repository
                .mark_funding_airdrop_failed(
                    &airdrop.id,
                    "AIRDROP_BLOCKHASH_UNAVAILABLE",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "AIRDROP_BLOCKHASH_UNAVAILABLE",
                "The blockhash worker ended before the developer airdrop; no transfer was attempted.",
            ));
        }
    };

    Ok(state
        .repository
        .set_funding_airdrop_submission_blockhash(&airdrop.id, &blockhash)
        .await?)
}

pub(super) async fn submit_and_observe_airdrop(
    state: &SharedState,
    airdrop: FundingAirdropRecord,
) -> FundingResult<FundingAirdropRecord> {
    let airdrop = prepare_airdrop_submission_intent(state, airdrop).await?;
    let blockhash = airdrop.submission_blockhash.clone().ok_or_else(|| {
        FundingHttpError::internal(
            "processing developer airdrop has no durable submission blockhash",
        )
    })?;
    let lamports = amount_to_lamports(airdrop.amount_aeko)?;
    let rpc = state.rpc.clone();
    let address = airdrop.address.clone();
    let submit_blockhash = blockhash.clone();
    let submit = tokio::task::spawn_blocking(move || {
        rpc.request_funding_airdrop(&address, lamports, Some(&submit_blockhash))
    })
    .await;

    let signature = match submit {
        Ok(Ok(signature)) => signature,
        Ok(Err(error)) => {
            tracing::warn!(
                airdrop_id = %airdrop.id,
                error = %error,
                "developer airdrop produced no durable transaction signature; persisted intent remains recoverable"
            );
            state
                .repository
                .mark_funding_airdrop_error(
                    &airdrop.id,
                    "AIRDROP_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "AIRDROP_SUBMISSION_RETRY_PENDING",
                "The developer airdrop did not produce a durable transaction signature. The backend will safely replay the same persisted transaction intent.",
            ));
        }
        Err(error) => {
            state
                .repository
                .mark_funding_airdrop_error(
                    &airdrop.id,
                    "AIRDROP_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await?;
            return Err(FundingHttpError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "AIRDROP_SUBMISSION_RETRY_PENDING",
                "The developer airdrop worker ended unexpectedly. The backend will safely replay the same persisted transaction intent.",
            ));
        }
    };

    let submitted = state
        .repository
        .set_funding_airdrop_signature(&airdrop.id, &signature)
        .await?;
    tracing::info!(
        airdrop_id = %airdrop.id,
        signature = %signature,
        "developer airdrop returned a durable signature; confirmation continues in the reconciler"
    );
    Ok(submitted)
}

// This legacy observer is intentionally retained only as a compatibility helper while
// all live HTTP submission paths return after signature persistence and the reconciler
// performs single-observation confirmation without resubmission.
#[allow(dead_code)]
async fn observe_airdrop(
    state: &SharedState,
    airdrop: FundingAirdropRecord,
) -> FundingResult<FundingAirdropRecord> {
    if airdrop.status == "confirmed" {
        return Ok(airdrop);
    }
    if airdrop.status != "submitted" {
        return Err(FundingHttpError::from(
            FundingStoreError::RequestAlreadyDecided {
                status: airdrop.status,
            },
        ));
    }
    let signature = airdrop.signature.clone().ok_or_else(|| {
        FundingHttpError::internal("submitted developer airdrop has no transaction signature")
    })?;

    let rpc = state.rpc.clone();
    let signature_for_wait = signature.clone();
    let blockhash_for_wait = airdrop.submission_blockhash.clone();
    let observation = tokio::task::spawn_blocking(move || {
        rpc.wait_for_funding_transfer_with_blockhash(
            &signature_for_wait,
            blockhash_for_wait.as_deref(),
            CONFIRMATION_ATTEMPTS,
            Duration::from_millis(CONFIRMATION_INTERVAL_MS),
        )
    })
    .await;

    match observation {
        Ok(Ok(FundingTransferStatus::Confirmed)) => Ok(state
            .repository
            .confirm_funding_airdrop(&airdrop.id)
            .await?),
        Ok(Ok(FundingTransferStatus::Failed(error))) => {
            state
                .repository
                .mark_funding_airdrop_failed(&airdrop.id, "AIRDROP_TRANSACTION_FAILED", &error)
                .await?;
            Err(FundingHttpError::new(
                StatusCode::BAD_GATEWAY,
                "AIRDROP_TRANSACTION_FAILED",
                format!("Developer airdrop transaction {signature} failed on-chain"),
            ))
        }
        Ok(Ok(FundingTransferStatus::Pending)) => Ok(state
            .repository
            .mark_funding_airdrop_error(
                &airdrop.id,
                "AIRDROP_CONFIRMATION_PENDING",
                "Transaction was submitted and is still awaiting chain confirmation",
            )
            .await?),
        Ok(Err(error)) => Ok(state
            .repository
            .mark_funding_airdrop_error(
                &airdrop.id,
                "AIRDROP_CONFIRMATION_UNAVAILABLE",
                &error.to_string(),
            )
            .await?),
        Err(error) => Ok(state
            .repository
            .mark_funding_airdrop_error(
                &airdrop.id,
                "AIRDROP_CONFIRMATION_UNAVAILABLE",
                &error.to_string(),
            )
            .await?),
    }
}

pub async fn run_settlement_reconciler(state: SharedState, interval: Duration) {
    if !state.is_funding_available() {
        return;
    }

    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        ticker.tick().await;
        let transitioned = reconcile_submitted_settlements_once(&state).await;
        if transitioned > 0 {
            tracing::info!(
                transitioned,
                network = %state.network,
                "reconciled submitted funding settlements"
            );
        }
    }
}

pub async fn reconcile_submitted_settlements_once(state: &SharedState) -> usize {
    if !state.is_funding_available() {
        return 0;
    }

    let mut transitioned = 0usize;

    let processing_requests = match state
        .repository
        .list_recoverable_processing_funding_requests(500)
        .await
    {
        Ok(requests) => requests,
        Err(error) => {
            tracing::error!(
                error = %error,
                network = %state.network,
                "failed to load recoverable processing funding submissions"
            );
            Vec::new()
        }
    };

    for request in processing_requests {
        if recover_processing_funding_submission(state, request).await {
            transitioned += 1;
        }
    }

    let processing_airdrops = match state
        .repository
        .list_recoverable_processing_funding_airdrops(500)
        .await
    {
        Ok(airdrops) => airdrops,
        Err(error) => {
            tracing::error!(
                error = %error,
                network = %state.network,
                "failed to load recoverable processing developer airdrops"
            );
            Vec::new()
        }
    };

    for airdrop in processing_airdrops {
        if recover_processing_airdrop_submission(state, airdrop).await {
            transitioned += 1;
        }
    }

    let requests = match state.repository.list_submitted_funding_requests(500).await {
        Ok(requests) => requests,
        Err(error) => {
            tracing::error!(
                error = %error,
                network = %state.network,
                "failed to load submitted funding settlements for reconciliation"
            );
            Vec::new()
        }
    };

    for request in requests {
        if reconcile_submitted_funding(state, request).await {
            transitioned += 1;
        }
    }

    let airdrops = match state.repository.list_submitted_funding_airdrops(500).await {
        Ok(airdrops) => airdrops,
        Err(error) => {
            tracing::error!(
                error = %error,
                network = %state.network,
                "failed to load submitted developer airdrops for reconciliation"
            );
            Vec::new()
        }
    };

    for airdrop in airdrops {
        if reconcile_submitted_airdrop(state, airdrop).await {
            transitioned += 1;
        }
    }

    transitioned
}

async fn recover_processing_funding_submission(
    state: &SharedState,
    request: FundingRequestRecord,
) -> bool {
    let Some(blockhash) = request.submission_blockhash.clone() else {
        return false;
    };
    let lamports = match amount_to_lamports(request.amount_aeko) {
        Ok(lamports) => lamports,
        Err(error) => {
            tracing::error!(
                request_id = %request.id,
                error = %error.message,
                "recoverable funding request contains an invalid persisted amount"
            );
            return false;
        }
    };

    let rpc = state.rpc.clone();
    let address = request.address.clone();
    let authorization = state.funding_authorization_key.clone();
    let submit_blockhash = blockhash.clone();
    let result = tokio::task::spawn_blocking(move || {
        rpc.request_funding_transfer(
            &address,
            lamports,
            authorization.as_deref(),
            Some(&submit_blockhash),
        )
    })
    .await;

    match result {
        Ok(Ok(signature)) => match state
            .repository
            .set_funding_request_signature(&request.id, &signature)
            .await
        {
            Ok(_) => true,
            Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
            Err(error) => {
                tracing::error!(
                    request_id = %request.id,
                    blockhash = %blockhash,
                    error = %error,
                    "failed to persist recovered funding signature"
                );
                false
            }
        },
        Ok(Err(error)) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_request_submission_error(
                    &request.id,
                    "FUNDING_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await
            {
                tracing::warn!(
                    request_id = %request.id,
                    blockhash = %blockhash,
                    error = %store_error,
                    "failed to persist funding safe-replay error"
                );
            }
            false
        }
        Err(error) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_request_submission_error(
                    &request.id,
                    "FUNDING_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await
            {
                tracing::warn!(
                    request_id = %request.id,
                    blockhash = %blockhash,
                    error = %store_error,
                    "failed to persist funding replay worker error"
                );
            }
            false
        }
    }
}

async fn recover_processing_airdrop_submission(
    state: &SharedState,
    airdrop: FundingAirdropRecord,
) -> bool {
    let Some(blockhash) = airdrop.submission_blockhash.clone() else {
        return false;
    };
    let lamports = match amount_to_lamports(airdrop.amount_aeko) {
        Ok(lamports) => lamports,
        Err(error) => {
            tracing::error!(
                airdrop_id = %airdrop.id,
                error = %error.message,
                "recoverable developer airdrop contains an invalid persisted amount"
            );
            return false;
        }
    };

    let rpc = state.rpc.clone();
    let address = airdrop.address.clone();
    let submit_blockhash = blockhash.clone();
    let result = tokio::task::spawn_blocking(move || {
        rpc.request_funding_airdrop(&address, lamports, Some(&submit_blockhash))
    })
    .await;

    match result {
        Ok(Ok(signature)) => match state
            .repository
            .set_funding_airdrop_signature(&airdrop.id, &signature)
            .await
        {
            Ok(_) => true,
            Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
            Err(error) => {
                tracing::error!(
                    airdrop_id = %airdrop.id,
                    blockhash = %blockhash,
                    error = %error,
                    "failed to persist recovered developer-airdrop signature"
                );
                false
            }
        },
        Ok(Err(error)) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_airdrop_error(
                    &airdrop.id,
                    "AIRDROP_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await
            {
                tracing::warn!(
                    airdrop_id = %airdrop.id,
                    blockhash = %blockhash,
                    error = %store_error,
                    "failed to persist developer-airdrop safe-replay error"
                );
            }
            false
        }
        Err(error) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_airdrop_error(
                    &airdrop.id,
                    "AIRDROP_SUBMISSION_RETRY_PENDING",
                    &error.to_string(),
                )
                .await
            {
                tracing::warn!(
                    airdrop_id = %airdrop.id,
                    blockhash = %blockhash,
                    error = %store_error,
                    "failed to persist developer-airdrop replay worker error"
                );
            }
            false
        }
    }
}

async fn reconcile_submitted_funding(state: &SharedState, request: FundingRequestRecord) -> bool {
    let Some(signature) = request.signature.clone() else {
        tracing::error!(
            request_id = %request.id,
            "submitted funding request has no signature and cannot be reconciled"
        );
        return false;
    };

    match funding_transfer_status_once(state, &signature, request.submission_blockhash.as_deref())
        .await
    {
        Ok(FundingTransferStatus::Confirmed) => {
            match state.repository.confirm_funding_request(&request.id).await {
                Ok(_) => true,
                Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
                Err(error) => {
                    tracing::error!(
                        request_id = %request.id,
                        signature = %signature,
                        error = %error,
                        "failed to persist confirmed funding settlement"
                    );
                    false
                }
            }
        }
        Ok(FundingTransferStatus::Failed(error)) => {
            match state
                .repository
                .mark_funding_request_failed(&request.id, "FUNDING_TRANSACTION_FAILED", &error)
                .await
            {
                Ok(_) => true,
                Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
                Err(store_error) => {
                    tracing::error!(
                        request_id = %request.id,
                        signature = %signature,
                        error = %store_error,
                        "failed to persist failed funding settlement"
                    );
                    false
                }
            }
        }
        Ok(FundingTransferStatus::Pending) => false,
        Err(error) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_request_observation_error(
                    &request.id,
                    "FUNDING_CONFIRMATION_UNAVAILABLE",
                    &error,
                )
                .await
            {
                tracing::warn!(
                    request_id = %request.id,
                    signature = %signature,
                    error = %store_error,
                    "failed to persist funding reconciliation observation error"
                );
            }
            false
        }
    }
}

async fn reconcile_submitted_airdrop(state: &SharedState, airdrop: FundingAirdropRecord) -> bool {
    let Some(signature) = airdrop.signature.clone() else {
        tracing::error!(
            airdrop_id = %airdrop.id,
            "submitted developer airdrop has no signature and cannot be reconciled"
        );
        return false;
    };

    match funding_transfer_status_once(state, &signature, airdrop.submission_blockhash.as_deref())
        .await
    {
        Ok(FundingTransferStatus::Confirmed) => {
            match state.repository.confirm_funding_airdrop(&airdrop.id).await {
                Ok(_) => true,
                Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
                Err(error) => {
                    tracing::error!(
                        airdrop_id = %airdrop.id,
                        signature = %signature,
                        error = %error,
                        "failed to persist confirmed developer airdrop"
                    );
                    false
                }
            }
        }
        Ok(FundingTransferStatus::Failed(error)) => {
            match state
                .repository
                .mark_funding_airdrop_failed(&airdrop.id, "AIRDROP_TRANSACTION_FAILED", &error)
                .await
            {
                Ok(_) => true,
                Err(FundingStoreError::RequestAlreadyDecided { .. }) => false,
                Err(store_error) => {
                    tracing::error!(
                        airdrop_id = %airdrop.id,
                        signature = %signature,
                        error = %store_error,
                        "failed to persist failed developer airdrop"
                    );
                    false
                }
            }
        }
        Ok(FundingTransferStatus::Pending) => false,
        Err(error) => {
            if let Err(store_error) = state
                .repository
                .mark_funding_airdrop_error(&airdrop.id, "AIRDROP_CONFIRMATION_UNAVAILABLE", &error)
                .await
            {
                tracing::warn!(
                    airdrop_id = %airdrop.id,
                    signature = %signature,
                    error = %store_error,
                    "failed to persist developer-airdrop reconciliation observation error"
                );
            }
            false
        }
    }
}

async fn funding_transfer_status_once(
    state: &SharedState,
    signature: &str,
    recent_blockhash: Option<&str>,
) -> Result<FundingTransferStatus, String> {
    let rpc = state.rpc.clone();
    let signature = signature.to_string();
    let recent_blockhash = recent_blockhash.map(str::to_owned);
    match tokio::task::spawn_blocking(move || {
        rpc.funding_transfer_status_with_blockhash(&signature, recent_blockhash.as_deref())
    })
    .await
    {
        Ok(Ok(status)) => Ok(status),
        Ok(Err(error)) => Err(error.to_string()),
        Err(error) => Err(error.to_string()),
    }
}
