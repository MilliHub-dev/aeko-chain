-- Expand durable funding rate-limit scopes to match the split origin/wallet
-- dimensions used by the Explorer funding API.
--
-- Migration 0011 stored one scope per workflow. The current API deliberately
-- records two independent dimensions for each public write so spoofed/or shared
-- network identity cannot bypass the wallet limiter and one wallet cannot
-- consume another origin's allowance.

ALTER TABLE funding_rate_events
    DROP CONSTRAINT IF EXISTS funding_rate_events_scope_check;

UPDATE funding_rate_events
SET scope = CASE scope
    WHEN 'public-request' THEN 'public-request-origin'
    WHEN 'console-airdrop' THEN 'console-airdrop-origin'
    ELSE scope
END
WHERE scope IN ('public-request', 'console-airdrop');

ALTER TABLE funding_rate_events
    ADD CONSTRAINT funding_rate_events_scope_check
    CHECK (
        scope IN (
            'public-request-origin',
            'public-request-wallet',
            'console-airdrop-origin',
            'console-airdrop-wallet'
        )
    );
