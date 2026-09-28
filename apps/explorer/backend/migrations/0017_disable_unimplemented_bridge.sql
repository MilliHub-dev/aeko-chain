-- The public Bridge page was a UI-only prototype while Phase 7 remains
-- unimplemented. Fail closed so production settings cannot expose simulated
-- cross-chain balances, fees, routes, or transfers as a live feature.
UPDATE explorer_app_settings
SET bridge_enabled = FALSE
WHERE bridge_enabled = TRUE;

ALTER TABLE explorer_app_settings
    ALTER COLUMN bridge_enabled SET DEFAULT FALSE;
