-- Normalize terminal Test Console failures migrated by 0012.
--
-- In the pre-0012 model, direct Console submission/chain failures were stored
-- as funding_requests.status='rejected' with FUNDING_* failure codes. The 0012
-- fallback maps otherwise-unrecognized historical statuses to 'processing'.
-- These two legacy codes are known terminal failures and must not remain
-- indefinitely in-flight after migration.
--
-- New-model uncertain airdrops use AIRDROP_SUBMISSION_UNCERTAIN and are
-- intentionally left in processing because retrying without a durable
-- signature could duplicate a transfer.

UPDATE funding_airdrops
SET status = 'failed'
WHERE status = 'processing'
  AND signature IS NULL
  AND error_code IN (
      'FUNDING_TRANSFER_FAILED',
      'FUNDING_TRANSACTION_FAILED'
  );
