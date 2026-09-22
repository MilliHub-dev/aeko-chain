-- Durable application-level controls for the public Explorer experience.
-- This singleton belongs to the same PostgreSQL database already bound to one
-- validator genesis, so settings cannot silently drift across chain histories.
CREATE TABLE IF NOT EXISTS explorer_app_settings (
    singleton                  BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    revision                   BIGINT      NOT NULL DEFAULT 1 CHECK (revision > 0),
    network_console_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
    nft_demo_enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
    nft_live_flow_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
    nft_advanced_tools_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
    explorer_list_size         INTEGER     NOT NULL DEFAULT 6 CHECK (explorer_list_size BETWEEN 3 AND 12),
    settings_refresh_seconds   INTEGER     NOT NULL DEFAULT 30 CHECK (settings_refresh_seconds BETWEEN 10 AND 300),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO explorer_app_settings (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;
