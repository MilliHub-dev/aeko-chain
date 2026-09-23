-- Keep the public AEKO-721 demo discoverable by default while operational and
-- write-oriented surfaces remain opt-in. Only migrate an untouched singleton
-- (revision 1), so operator choices already saved through Admin are preserved.
ALTER TABLE explorer_app_settings
    ALTER COLUMN network_console_enabled SET DEFAULT FALSE,
    ALTER COLUMN nft_demo_enabled SET DEFAULT TRUE,
    ALTER COLUMN nft_live_flow_enabled SET DEFAULT FALSE,
    ALTER COLUMN nft_advanced_tools_enabled SET DEFAULT FALSE;

UPDATE explorer_app_settings
SET
    network_console_enabled = FALSE,
    nft_demo_enabled = TRUE,
    nft_live_flow_enabled = FALSE,
    nft_advanced_tools_enabled = FALSE,
    revision = revision + 1,
    updated_at = NOW()
WHERE singleton = TRUE
  AND revision = 1
  AND network_console_enabled = TRUE
  AND nft_demo_enabled = TRUE
  AND nft_live_flow_enabled = TRUE
  AND nft_advanced_tools_enabled = TRUE;
