-- PR #23 persisted core history at confirmed commitment. PR #24 tightens the
-- durable Explorer invariant to finalized chain state and uses authoritative
-- per-slot replacement during replay. Rewind to the earliest persisted core
-- row so old-fork blocks/transactions/events cannot remain queryable.
--
-- This is a new migration instead of editing 0003 so databases that already
-- applied the draft migration keep a stable sqlx migration checksum.
UPDATE indexer_cursors
SET next_slot = LEAST(
        next_slot,
        COALESCE(
            (
                SELECT MIN(slot)
                FROM (
                    SELECT slot FROM blocks
                    UNION ALL
                    SELECT slot FROM transactions
                ) AS persisted_core_slots
            ),
            next_slot
        )
    ),
    updated_at = NOW()
WHERE stream = 'core';
