-- Expand the durable application control plane with concrete public-route
-- visibility and Explorer behavior settings. These values are consumed by the
-- Explorer web app; they are not deployment endpoints or blockchain protocol
-- configuration.
ALTER TABLE explorer_app_settings
    ADD COLUMN IF NOT EXISTS network_tools_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS docs_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS developers_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS bridge_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS explorer_search_result_limit INTEGER NOT NULL DEFAULT 12
        CHECK (explorer_search_result_limit BETWEEN 5 AND 50),
    ADD COLUMN IF NOT EXISTS explorer_auto_refresh_seconds INTEGER NOT NULL DEFAULT 15
        CHECK (explorer_auto_refresh_seconds BETWEEN 5 AND 300);
