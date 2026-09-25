-- Durable Scan funding queue, policy and grant ledger.
-- Replaces the Operations Web JSON-file funding ledger and funds policy
-- accounting. Chain settlement is still server-side requestAirdrop
-- against the private Faucet Daemon; this table is queue/budget
-- accounting only and is not a separate money supply.
CREATE TABLE IF NOT EXISTS funding_settings (
    singleton           BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    enabled             BOOLEAN     NOT NULL DEFAULT TRUE,
    amount_aeko         NUMERIC     NOT NULL DEFAULT 5 CHECK (amount_aeko > 0),
    cooldown_hours      NUMERIC     NOT NULL DEFAULT 24 CHECK (cooldown_hours >= 0),
    daily_budget_aeko   NUMERIC     NOT NULL DEFAULT 5000 CHECK (daily_budget_aeko > 0),
    max_manual_grant_aeko NUMERIC NOT NULL DEFAULT 100 CHECK (max_manual_grant_aeko > 0),
    console_airdrop_cap_aeko NUMERIC NOT NULL DEFAULT 25 CHECK (console_airdrop_cap_aeko > 0),
    revision            BIGINT      NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO funding_settings (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS funding_requests (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    address     TEXT        NOT NULL CHECK (length(address) >= 1),
    amount_aeko NUMERIC     NOT NULL CHECK (amount_aeko > 0),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source      TEXT        NOT NULL DEFAULT 'public' CHECK (source IN ('public', 'console', 'admin')),
    status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'approved', 'rejected')),
    decided_at  TIMESTAMPTZ NULL,
    signature   TEXT        NULL,
    error_code  TEXT        NULL,
    error_message TEXT      NULL
);

CREATE INDEX IF NOT EXISTS idx_funding_requests_address_status ON funding_requests (address, status);
CREATE INDEX IF NOT EXISTS idx_funding_requests_status ON funding_requests (status);

CREATE TABLE IF NOT EXISTS funding_grants (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    address     TEXT        NOT NULL CHECK (length(address) >= 1),
    amount_aeko NUMERIC     NOT NULL CHECK (amount_aeko > 0),
    signature   TEXT        NULL,
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source      TEXT        NOT NULL DEFAULT 'console' CHECK (source IN ('public', 'console', 'admin')),
    confirmed   BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_funding_grants_address ON funding_grants (address);
