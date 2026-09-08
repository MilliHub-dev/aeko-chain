-- Persist every account involved in an indexed transaction so address history
-- is derived from the chain message, not approximated from the fee payer/signature owner.
CREATE TABLE IF NOT EXISTS transaction_accounts (
    signature      TEXT    NOT NULL REFERENCES transactions(signature) ON DELETE CASCADE,
    account_index  INTEGER NOT NULL CHECK (account_index >= 0),
    address        TEXT    NOT NULL,
    PRIMARY KEY (signature, account_index)
);

CREATE INDEX IF NOT EXISTS idx_transaction_accounts_address_signature
    ON transaction_accounts (address, signature);

-- Preserve the one participant that the previous schema could prove while the
-- full historical account projection is rebuilt. The existing `signer` value
-- comes from message account index 0 in the chain parser.
INSERT INTO transaction_accounts (signature, account_index, address)
SELECT signature, 0, signer
FROM transactions
WHERE signer IS NOT NULL AND signer <> ''
ON CONFLICT (signature, account_index) DO UPDATE SET
    address = EXCLUDED.address;

-- Existing transaction rows predate the participant projection. Rewind the
-- durable core cursor to the earliest persisted transaction so the idempotent
-- block/transaction/event upserts rebuild complete account membership from
-- finalized chain data. If that history is unavailable from the configured RPC,
-- the indexer fails closed at the first unprovable slot instead of advertising
-- incomplete non-signer history as authoritative.
UPDATE indexer_cursors
SET next_slot = LEAST(
        next_slot,
        COALESCE((SELECT MIN(slot) FROM transactions), next_slot)
    ),
    updated_at = NOW()
WHERE stream = 'core';
