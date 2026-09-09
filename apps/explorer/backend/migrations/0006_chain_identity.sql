-- Prevent one Explorer PostgreSQL database from being reused by different
-- validator ledgers. The row is a singleton binding between the durable
-- projection store and the validator genesis it was created to index.
CREATE TABLE IF NOT EXISTS explorer_chain_identity (
    singleton      BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    network        TEXT        NOT NULL,
    genesis_hash   TEXT        NOT NULL,
    bound_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_explorer_chain_identity_genesis
    ON explorer_chain_identity (genesis_hash);
