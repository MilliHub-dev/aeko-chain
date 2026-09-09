-- Complete durable projection for the five native AEKO Social domains.
-- This is forward-only. Existing migrations remain unchanged so deployed
-- databases keep stable sqlx migration checksums.

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS content_hash TEXT,
    ADD COLUMN IF NOT EXISTS metadata_hash TEXT,
    ADD COLUMN IF NOT EXISTS parent_post_id TEXT,
    ADD COLUMN IF NOT EXISTS edited_at_unix BIGINT,
    ADD COLUMN IF NOT EXISTS signature_ref TEXT;

ALTER TABLE engagement_events
    ADD COLUMN IF NOT EXISTS replay_guard TEXT;

ALTER TABLE creator_rewards
    ADD COLUMN IF NOT EXISTS earned_points TEXT NOT NULL DEFAULT '0',
    ADD COLUMN IF NOT EXISTS claimed_amount TEXT NOT NULL DEFAULT '0',
    ADD COLUMN IF NOT EXISTS penalty_bps INTEGER NOT NULL DEFAULT 0
        CHECK (penalty_bps >= 0 AND penalty_bps <= 10000);

ALTER TABLE social_stakes
    ADD COLUMN IF NOT EXISTS activated_at_epoch BIGINT,
    ADD COLUMN IF NOT EXISTS unlock_epoch BIGINT;

CREATE TABLE IF NOT EXISTS social_reward_accounts (
    creator             TEXT        PRIMARY KEY,
    total_earned        TEXT        NOT NULL,
    total_claimed       TEXT        NOT NULL,
    claimable_amount    TEXT        NOT NULL,
    last_settled_epoch  BIGINT      NOT NULL CHECK (last_settled_epoch >= 0),
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reward_settlements (
    epoch                   BIGINT      PRIMARY KEY CHECK (epoch >= 0),
    reward_pool_amount      TEXT        NOT NULL,
    total_effective_points  TEXT        NOT NULL,
    settled_creator_count   BIGINT      NOT NULL CHECK (settled_creator_count >= 0),
    indexed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stake_yield_records (
    epoch          BIGINT      NOT NULL CHECK (epoch >= 0),
    position_id    TEXT        NOT NULL,
    creator        TEXT        NOT NULL,
    staker         TEXT        NOT NULL,
    yield_amount   TEXT        NOT NULL,
    indexed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (epoch, position_id)
);

CREATE INDEX IF NOT EXISTS idx_stake_yield_creator ON stake_yield_records (creator, epoch DESC);
CREATE INDEX IF NOT EXISTS idx_stake_yield_staker ON stake_yield_records (staker, epoch DESC);

CREATE TABLE IF NOT EXISTS anti_spam_profiles (
    wallet                    TEXT        PRIMARY KEY,
    post_count_window         BIGINT      NOT NULL CHECK (post_count_window >= 0),
    engagement_count_window   BIGINT      NOT NULL CHECK (engagement_count_window >= 0),
    spam_flags                INTEGER     NOT NULL CHECK (spam_flags >= 0),
    gated_until_epoch         BIGINT,
    slash_count               INTEGER     NOT NULL CHECK (slash_count >= 0),
    last_flagged_at_unix      BIGINT,
    reputation_score          INTEGER     NOT NULL CHECK (reputation_score >= 0 AND reputation_score <= 10000),
    indexed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_tips (
    tip_id         TEXT        PRIMARY KEY,
    creator        TEXT        NOT NULL,
    sender         TEXT        NOT NULL,
    amount         TEXT        NOT NULL,
    timestamp      BIGINT      NOT NULL,
    indexed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creator_tips_creator_time ON creator_tips (creator, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_creator_tips_sender_time ON creator_tips (sender, timestamp DESC);

CREATE TABLE IF NOT EXISTS social_subscriptions (
    subscription_id   TEXT        PRIMARY KEY,
    creator           TEXT        NOT NULL,
    subscriber        TEXT        NOT NULL,
    amount_per_period TEXT        NOT NULL,
    period_seconds    BIGINT      NOT NULL CHECK (period_seconds >= 0),
    started_at_unix   BIGINT      NOT NULL,
    valid_until_unix  BIGINT      NOT NULL,
    state             TEXT        NOT NULL,
    indexed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_subscriptions_creator ON social_subscriptions (creator, valid_until_unix DESC);
CREATE INDEX IF NOT EXISTS idx_social_subscriptions_subscriber ON social_subscriptions (subscriber, valid_until_unix DESC);

CREATE TABLE IF NOT EXISTS paid_content_unlocks (
    unlock_id        TEXT        PRIMARY KEY,
    content_id       TEXT        NOT NULL,
    creator          TEXT        NOT NULL,
    buyer            TEXT        NOT NULL,
    amount           TEXT        NOT NULL,
    unlocked_at_unix BIGINT      NOT NULL,
    indexed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paid_unlocks_creator ON paid_content_unlocks (creator, unlocked_at_unix DESC);
CREATE INDEX IF NOT EXISTS idx_paid_unlocks_buyer ON paid_content_unlocks (buyer, unlocked_at_unix DESC);
CREATE INDEX IF NOT EXISTS idx_paid_unlocks_content ON paid_content_unlocks (content_id);

CREATE TABLE IF NOT EXISTS creator_revenues (
    creator          TEXT        PRIMARY KEY,
    total_earned     TEXT        NOT NULL,
    total_claimed    TEXT        NOT NULL,
    claimable_amount TEXT        NOT NULL,
    indexed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_domain_snapshots (
    domain         TEXT        PRIMARY KEY,
    state_account  TEXT        NOT NULL,
    program_id     TEXT        NOT NULL,
    slot           BIGINT      NOT NULL CHECK (slot >= 0),
    epoch          BIGINT      NOT NULL CHECK (epoch >= 0),
    item_count     BIGINT      NOT NULL CHECK (item_count >= 0),
    indexed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts (parent_post_id);
CREATE INDEX IF NOT EXISTS idx_rewards_creator_epoch ON creator_rewards (creator, epoch DESC);
