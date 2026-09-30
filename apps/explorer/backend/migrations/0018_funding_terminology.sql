-- Normalize the active funding schema so "grant" is no longer a second
-- product/runtime concept. Historical migrations remain unchanged because they
-- are immutable records of previously deployed schema states.

ALTER TABLE funding_settings
    RENAME COLUMN max_manual_grant_aeko TO max_admin_funding_aeko;

ALTER TABLE funding_grants
    RENAME TO funding_transfers;

ALTER TABLE funding_transfers
    RENAME COLUMN granted_at TO funded_at;

COMMENT ON TABLE funding_transfers IS
    'Confirmed public and Admin funding transfers. Developer airdrops are stored separately.';

COMMENT ON COLUMN funding_settings.max_admin_funding_aeko IS
    'Maximum authenticated direct Admin funding send, in AEKO.';
