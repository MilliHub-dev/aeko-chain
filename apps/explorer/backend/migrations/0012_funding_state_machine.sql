-- Make test grant settlement durable and separate developer airdrops from Admin-approved grants.
--
-- Grant request lifecycle:
--   pending -> processing -> submitted -> confirmed
--                         \-> failed
--   pending -> rejected
--
-- "processing" means an Admin-approved grant is being submitted and no
-- transaction signature has been durably recorded yet. "submitted" means a
-- signature exists and the amount remains reserved until chain confirmation.
-- A developer airdrop never enters the Admin grant queue.

ALTER TABLE funding_requests
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL;

-- Preserve historical rows created by the earlier implementation.
UPDATE funding_requests
SET
    status = CASE
        WHEN status = 'approved' AND confirmed THEN 'confirmed'
        WHEN status = 'approved' THEN 'submitted'
        ELSE status
    END,
    submitted_at = COALESCE(submitted_at, CASE WHEN signature IS NOT NULL THEN decided_at ELSE NULL END),
    confirmed_at = COALESCE(confirmed_at, CASE WHEN confirmed THEN decided_at ELSE NULL END);

ALTER TABLE funding_requests
    DROP CONSTRAINT IF EXISTS funding_requests_status_check;

ALTER TABLE funding_requests
    ADD CONSTRAINT funding_requests_status_check
    CHECK (status IN ('pending', 'processing', 'submitted', 'confirmed', 'failed', 'rejected'));

CREATE INDEX IF NOT EXISTS funding_requests_public_active_idx
    ON funding_requests (address, requested_at DESC)
    WHERE source = 'public' AND status IN ('pending', 'processing', 'submitted');

ALTER TABLE funding_grants
    ADD COLUMN IF NOT EXISTS request_id UUID NULL REFERENCES funding_requests(id);

CREATE UNIQUE INDEX IF NOT EXISTS funding_grants_request_unique
    ON funding_grants (request_id)
    WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS funding_airdrops (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    address         TEXT        NOT NULL CHECK (length(address) >= 1),
    amount_aeko     NUMERIC     NOT NULL CHECK (amount_aeko > 0),
    signature       TEXT        NULL,
    status          TEXT        NOT NULL DEFAULT 'processing'
                                CHECK (status IN ('processing', 'submitted', 'confirmed', 'failed')),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at    TIMESTAMPTZ NULL,
    confirmed_at    TIMESTAMPTZ NULL,
    error_code      TEXT        NULL,
    error_message   TEXT        NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS funding_airdrops_signature_unique
    ON funding_airdrops (signature)
    WHERE signature IS NOT NULL;

CREATE INDEX IF NOT EXISTS funding_airdrops_requested_idx
    ON funding_airdrops (requested_at DESC);

-- Migrate historical Test Console records out of the grant ledger. The request
-- rows are left intact as historical compatibility records; new airdrops no
-- longer use funding_requests/funding_grants.
INSERT INTO funding_airdrops (
    address,
    amount_aeko,
    signature,
    status,
    requested_at,
    submitted_at,
    confirmed_at
)
SELECT
    address,
    amount_aeko,
    signature,
    CASE WHEN confirmed THEN 'confirmed' ELSE 'submitted' END,
    granted_at,
    granted_at,
    CASE WHEN confirmed THEN granted_at ELSE NULL END
FROM funding_grants
WHERE source = 'console'
ON CONFLICT (signature) WHERE signature IS NOT NULL DO NOTHING;

DELETE FROM funding_grants WHERE source = 'console';

-- Any historical Console request rows are also moved out of the grant queue.
-- Confirmed rows with a signature already migrated from funding_grants are
-- deduplicated by the signature index.
INSERT INTO funding_airdrops (
    address,
    amount_aeko,
    signature,
    status,
    requested_at,
    submitted_at,
    confirmed_at,
    error_code,
    error_message
)
SELECT
    address,
    amount_aeko,
    signature,
    CASE status
        WHEN 'confirmed' THEN 'confirmed'
        WHEN 'submitted' THEN 'submitted'
        WHEN 'failed' THEN 'failed'
        ELSE 'processing'
    END,
    requested_at,
    submitted_at,
    confirmed_at,
    error_code,
    error_message
FROM funding_requests
WHERE source = 'console'
ON CONFLICT (signature) WHERE signature IS NOT NULL DO NOTHING;

DELETE FROM funding_requests WHERE source = 'console';

ALTER TABLE funding_requests
    DROP CONSTRAINT IF EXISTS funding_requests_source_check;

ALTER TABLE funding_requests
    ADD CONSTRAINT funding_requests_source_check
    CHECK (source IN ('public', 'admin'));

ALTER TABLE funding_grants
    DROP CONSTRAINT IF EXISTS funding_grants_source_check;

ALTER TABLE funding_grants
    ADD CONSTRAINT funding_grants_source_check
    CHECK (source IN ('public', 'admin'));

COMMENT ON TABLE funding_requests IS
    'Admin-controlled test grant queue. Scan may create public requests, but only Operations Admin may decide them.';
COMMENT ON TABLE funding_grants IS
    'Confirmed Admin-approved/manual test grants only; developer airdrops are stored separately.';
COMMENT ON TABLE funding_airdrops IS
    'Direct developer Test Console airdrops. They never enter the Admin grant approval queue.';
