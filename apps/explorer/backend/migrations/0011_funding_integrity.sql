-- Complete the durable funding control plane introduced in 0010.
--
-- Public funding requests have a bounded approval policy. Test Console
-- airdrops have no aggregate application-level daily allocation, but every
-- transfer remains bounded by the configured per-request safety ceiling and
-- by the finite testnet Faucet account.

CREATE UNIQUE INDEX IF NOT EXISTS funding_grants_signature_unique
    ON funding_grants (signature)
    WHERE signature IS NOT NULL;

CREATE TABLE IF NOT EXISTS funding_rate_events (
    id          BIGSERIAL    PRIMARY KEY,
    scope       TEXT         NOT NULL CHECK (scope IN ('public-request', 'console-airdrop')),
    subject     TEXT         NOT NULL,
    occurred_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS funding_rate_events_lookup_idx
    ON funding_rate_events (scope, subject, occurred_at DESC);

COMMENT ON TABLE funding_rate_events IS
    'Durable abuse-control events for public funding requests and direct test-console airdrops.';
