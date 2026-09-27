-- Funding settlement is a durable state machine.
--
-- A request is not a grant until the transaction is confirmed on chain.
-- Submitted transactions remain reserved and reconcilable across polling
-- timeouts. A process interruption before the signature is durably written is
-- surfaced explicitly rather than automatically resubmitted.
ALTER TABLE funding_requests
    DROP CONSTRAINT IF EXISTS funding_requests_status_check;

ALTER TABLE funding_requests
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ NULL;

UPDATE funding_requests
SET
    submitted_at = COALESCE(submitted_at, decided_at, requested_at),
    last_checked_at = COALESCE(last_checked_at, decided_at, requested_at)
WHERE signature IS NOT NULL;

UPDATE funding_requests
SET
    status = CASE
        WHEN status = 'approved' AND confirmed = TRUE THEN 'confirmed'
        WHEN status = 'approved' AND confirmed = FALSE AND signature IS NOT NULL THEN 'submitted'
        WHEN status = 'approved' AND confirmed = FALSE THEN 'reconciliation_required'
        WHEN status = 'processing' AND signature IS NOT NULL THEN 'submitted'
        ELSE status
    END,
    confirmed_at = CASE
        WHEN status = 'approved' AND confirmed = TRUE
            THEN COALESCE(confirmed_at, decided_at, requested_at)
        ELSE confirmed_at
    END;

-- Earlier code wrote an unconfirmed grant when confirmation polling timed out.
-- Those rows are not grants and must return to the submitted request lifecycle.
DELETE FROM funding_grants WHERE confirmed = FALSE;

ALTER TABLE funding_requests
    ADD CONSTRAINT funding_requests_status_check
    CHECK (
        status IN (
            'pending',
            'processing',
            'submitted',
            'reconciliation_required',
            'confirmed',
            'rejected',
            'failed'
        )
    );

CREATE INDEX IF NOT EXISTS idx_funding_requests_reconciliation
    ON funding_requests (status, COALESCE(last_checked_at, submitted_at, decided_at, requested_at));
