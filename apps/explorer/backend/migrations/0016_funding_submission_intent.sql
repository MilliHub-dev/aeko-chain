-- Persist the exact blockhash used to construct each Faucet transfer so an
-- uncertain requestAirdrop transport outcome can be replayed idempotently.
--
-- The Faucet signs a deterministic transfer for (recipient, amount, blockhash).
-- Reusing the stored blockhash therefore recreates the same transaction/signature
-- instead of authorizing a second transfer with a fresh blockhash.

ALTER TABLE funding_requests
    ADD COLUMN IF NOT EXISTS submission_blockhash TEXT NULL
        CHECK (submission_blockhash IS NULL OR length(submission_blockhash) >= 1);

ALTER TABLE funding_airdrops
    ADD COLUMN IF NOT EXISTS submission_blockhash TEXT NULL
        CHECK (submission_blockhash IS NULL OR length(submission_blockhash) >= 1);

CREATE INDEX IF NOT EXISTS funding_requests_processing_recovery_idx
    ON funding_requests (decided_at ASC)
    WHERE status = 'processing'
      AND signature IS NULL
      AND submission_blockhash IS NOT NULL;

CREATE INDEX IF NOT EXISTS funding_airdrops_processing_recovery_idx
    ON funding_airdrops (requested_at ASC)
    WHERE status = 'processing'
      AND signature IS NULL
      AND submission_blockhash IS NOT NULL;

COMMENT ON COLUMN funding_requests.submission_blockhash IS
    'Blockhash persisted before Faucet RPC submission. Retrying this exact intent is idempotent.';
COMMENT ON COLUMN funding_airdrops.submission_blockhash IS
    'Blockhash persisted before developer-airdrop Faucet RPC submission for safe replay.';
