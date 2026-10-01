-- Bind direct Admin Funding HTTP retries to one durable settlement intent.
--
-- Operations Web forwards X-Request-Id to Explorer. Persisting that identifier
-- means an ambiguous proxy/RPC failure can be retried without creating a new
-- funding request or a second transfer. Public funding remains keyed by its
-- existing queue request id.
ALTER TABLE funding_requests
    ADD COLUMN idempotency_key TEXT NULL;

ALTER TABLE funding_requests
    ADD CONSTRAINT funding_requests_idempotency_key_length_check
    CHECK (
        idempotency_key IS NULL
        OR (length(idempotency_key) BETWEEN 1 AND 128)
    );

CREATE UNIQUE INDEX funding_requests_admin_idempotency_unique
    ON funding_requests (idempotency_key)
    WHERE source = 'admin' AND idempotency_key IS NOT NULL;

COMMENT ON COLUMN funding_requests.idempotency_key IS
    'Direct Admin Funding idempotency key sourced from X-Request-Id and reused across ambiguous HTTP retries.';
