-- Backfill the request linkage for grant rows created by the pre-0012
-- settlement model. Historical public/admin grants were keyed by transaction
-- signature but did not carry request_id.
--
-- A request that was approved but not yet confirmed is converted to
-- status='submitted' by 0012. Linking its existing grant row here lets the new
-- confirmation path update that row rather than collide with the signature
-- uniqueness invariant.

WITH request_by_signature AS (
    SELECT DISTINCT ON (signature, source)
        id,
        signature,
        source,
        address
    FROM funding_requests
    WHERE signature IS NOT NULL
      AND source IN ('public', 'admin')
    ORDER BY signature, source, requested_at DESC
)
UPDATE funding_grants AS funding_grant
SET request_id = funding_request.id
FROM request_by_signature AS funding_request
WHERE funding_grant.request_id IS NULL
  AND funding_grant.signature = funding_request.signature
  AND funding_grant.source = funding_request.source
  AND funding_grant.address = funding_request.address;
