-- Production indexing invariants.
--
-- PostgreSQL is the Explorer system of record. This migration separates
-- current token/NFT account state from immutable transaction events and gives
-- the indexer a durable cursor so restarts resume from the last committed slot.

CREATE TABLE IF NOT EXISTS indexer_cursors (
    stream       TEXT        PRIMARY KEY,
    next_slot    BIGINT      NOT NULL CHECK (next_slot >= 0),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_mints (
    mint              TEXT        PRIMARY KEY,
    mint_authority    TEXT,
    freeze_authority  TEXT,
    name              TEXT        NOT NULL,
    symbol            TEXT        NOT NULL,
    decimals          INTEGER     NOT NULL CHECK (decimals >= 0 AND decimals <= 255),
    total_supply      TEXT        NOT NULL,
    supply_cap        TEXT,
    metadata_uri      TEXT,
    mint_policy       TEXT        NOT NULL,
    last_seen_slot    BIGINT      NOT NULL CHECK (last_seen_slot >= 0),
    indexed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_accounts (
    address         TEXT        PRIMARY KEY,
    owner           TEXT        NOT NULL,
    mint            TEXT        NOT NULL,
    balance         TEXT        NOT NULL,
    frozen          BOOLEAN     NOT NULL,
    last_seen_slot  BIGINT      NOT NULL CHECK (last_seen_slot >= 0),
    indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_accounts_mint ON token_accounts (mint);
CREATE INDEX IF NOT EXISTS idx_token_accounts_owner ON token_accounts (owner);
CREATE INDEX IF NOT EXISTS idx_token_accounts_mint_owner ON token_accounts (mint, owner);

CREATE TABLE IF NOT EXISTS nft_collections (
    collection_id   TEXT        PRIMARY KEY,
    authority       TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    symbol          TEXT        NOT NULL,
    base_uri        TEXT,
    total_minted    BIGINT      NOT NULL CHECK (total_minted >= 0),
    last_seen_slot  BIGINT      NOT NULL CHECK (last_seen_slot >= 0),
    indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE nfts
    ADD COLUMN IF NOT EXISTS last_seen_slot BIGINT NOT NULL DEFAULT 0;

-- Rows with synthetic snapshot:* signatures were produced from current token
-- balances and were never real chain transfer events. Remove them before the
-- event table is tightened.
DELETE FROM token_transfers WHERE signature LIKE 'snapshot:%';

ALTER TABLE token_transfers
    ADD COLUMN IF NOT EXISTS event_index TEXT NOT NULL DEFAULT '0';

ALTER TABLE token_transfers
    DROP CONSTRAINT IF EXISTS token_transfers_signature_mint_source_destination_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_transfers_event
    ON token_transfers (signature, event_index);

CREATE INDEX IF NOT EXISTS idx_token_transfers_address_source
    ON token_transfers (source, slot DESC);
CREATE INDEX IF NOT EXISTS idx_token_transfers_address_destination
    ON token_transfers (destination, slot DESC);
