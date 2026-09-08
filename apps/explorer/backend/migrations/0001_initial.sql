-- Initial schema for the AEKO explorer backend.
--
-- Design notes:
--   - All `amount`/`*_amount` columns are TEXT. Solana u64 doesn't fit
--     Postgres BIGINT (i64) without a cast, and we already serialize
--     these as strings in the JSON envelope. Keeping them as TEXT avoids
--     a NUMERIC dep and keeps round-trips trivial.
--   - Slot, epoch, and unix_timestamp are BIGINT — comfortably within i64
--     for the next ~292 years of Solana slots.
--   - `indexed_at` columns track when we observed the row, distinct from
--     the on-chain unix_timestamp. Useful for "what came in since deploy".
--   - Indexes are conservative — slot DESC for tailing, foreign-keyish
--     columns (signer, creator, address) for the existing filter params.
--     Add JSONB + GIN indexes later when we start storing variable-shape
--     payloads.

CREATE TABLE IF NOT EXISTS blocks (
    slot              BIGINT      PRIMARY KEY,
    blockhash         TEXT        NOT NULL,
    parent_slot       BIGINT      NOT NULL,
    transaction_count BIGINT      NOT NULL,
    producer          TEXT,
    unix_timestamp    BIGINT,
    indexed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocks_slot_desc ON blocks (slot DESC);

CREATE TABLE IF NOT EXISTS transactions (
    signature       TEXT        PRIMARY KEY,
    slot            BIGINT      NOT NULL,
    success         BOOLEAN     NOT NULL,
    fee             BIGINT      NOT NULL,
    primary_program TEXT,
    signer          TEXT,
    indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_slot_desc      ON transactions (slot DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_signer         ON transactions (signer);
CREATE INDEX IF NOT EXISTS idx_transactions_primary_program ON transactions (primary_program);

-- Token transfers are append-only events. No PK in the source domain so
-- we use a BIGSERIAL and dedupe via (signature, mint, source, destination).
CREATE TABLE IF NOT EXISTS token_transfers (
    id           BIGSERIAL   PRIMARY KEY,
    mint         TEXT        NOT NULL,
    source       TEXT        NOT NULL,
    destination  TEXT        NOT NULL,
    amount       TEXT        NOT NULL,
    signature    TEXT        NOT NULL,
    slot         BIGINT      NOT NULL,
    indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (signature, mint, source, destination)
);

CREATE INDEX IF NOT EXISTS idx_token_transfers_mint        ON token_transfers (mint);
CREATE INDEX IF NOT EXISTS idx_token_transfers_source      ON token_transfers (source);
CREATE INDEX IF NOT EXISTS idx_token_transfers_destination ON token_transfers (destination);
CREATE INDEX IF NOT EXISTS idx_token_transfers_slot_desc   ON token_transfers (slot DESC);

CREATE TABLE IF NOT EXISTS nfts (
    token_id      TEXT        PRIMARY KEY,
    collection_id TEXT,
    owner         TEXT        NOT NULL,
    creator       TEXT        NOT NULL,
    metadata_uri  TEXT,
    frozen        BOOLEAN     NOT NULL DEFAULT FALSE,
    indexed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfts_collection_id ON nfts (collection_id);
CREATE INDEX IF NOT EXISTS idx_nfts_owner         ON nfts (owner);
CREATE INDEX IF NOT EXISTS idx_nfts_creator       ON nfts (creator);

CREATE TABLE IF NOT EXISTS posts (
    post_id          TEXT        PRIMARY KEY,
    creator          TEXT        NOT NULL,
    content_uri      TEXT        NOT NULL,
    post_kind        TEXT        NOT NULL,
    visibility       TEXT        NOT NULL,
    moderation_state TEXT        NOT NULL,
    created_at_unix  BIGINT      NOT NULL,
    indexed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_creator         ON posts (creator);
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON posts (created_at_unix DESC);
CREATE INDEX IF NOT EXISTS idx_posts_kind            ON posts (post_kind);
CREATE INDEX IF NOT EXISTS idx_posts_visibility      ON posts (visibility);

CREATE TABLE IF NOT EXISTS engagement_events (
    proof_id        TEXT        PRIMARY KEY,
    actor           TEXT        NOT NULL,
    target_creator  TEXT        NOT NULL,
    target_post_id  TEXT,
    action_kind     TEXT        NOT NULL,
    action_weight   BIGINT      NOT NULL,
    slot            BIGINT      NOT NULL,
    unix_timestamp  BIGINT      NOT NULL,
    indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_actor          ON engagement_events (actor);
CREATE INDEX IF NOT EXISTS idx_engagement_target_creator ON engagement_events (target_creator);
CREATE INDEX IF NOT EXISTS idx_engagement_target_post    ON engagement_events (target_post_id);
CREATE INDEX IF NOT EXISTS idx_engagement_slot_desc      ON engagement_events (slot DESC);

CREATE TABLE IF NOT EXISTS social_stakes (
    position_id        TEXT        PRIMARY KEY,
    staker             TEXT        NOT NULL,
    creator            TEXT        NOT NULL,
    staked_amount      TEXT        NOT NULL,
    state              TEXT        NOT NULL,
    accumulated_yield  TEXT        NOT NULL,
    claimed_yield      TEXT        NOT NULL,
    indexed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stakes_staker  ON social_stakes (staker);
CREATE INDEX IF NOT EXISTS idx_stakes_creator ON social_stakes (creator);
CREATE INDEX IF NOT EXISTS idx_stakes_state   ON social_stakes (state);

CREATE TABLE IF NOT EXISTS creator_rewards (
    creator          TEXT        NOT NULL,
    epoch            BIGINT      NOT NULL,
    reward_amount    TEXT        NOT NULL,
    claimable_amount TEXT        NOT NULL,
    indexed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (creator, epoch)
);

CREATE INDEX IF NOT EXISTS idx_creator_rewards_epoch_desc ON creator_rewards (epoch DESC);

CREATE TABLE IF NOT EXISTS wallet_profiles (
    address          TEXT        PRIMARY KEY,
    reputation_score INTEGER,        -- nullable u16 → INTEGER
    native_balance   TEXT,           -- u64 stored as TEXT, see header note
    token_count      BIGINT      NOT NULL DEFAULT 0,
    nft_count        BIGINT      NOT NULL DEFAULT 0,
    indexed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
