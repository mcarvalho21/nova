-- ════════════════════════════════════════════════════════════════
-- WEEK 2: INTEGRATION HARDENING
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────
-- Add expected_entity_version to events (OCC support)
-- ────────────────────────────────────────────────────

ALTER TABLE events
    ADD COLUMN expected_entity_version BIGINT;

-- ────────────────────────────────────────────────────
-- Change effective_date from DATE to TIMESTAMPTZ
-- (preserves full timestamp, avoids timezone issues)
-- ────────────────────────────────────────────────────

ALTER TABLE events
    ALTER COLUMN effective_date TYPE TIMESTAMPTZ;

-- ────────────────────────────────────────────────────
-- ITEM LIST PROJECTION TABLE (second projection)
-- ────────────────────────────────────────────────────

CREATE TABLE item_list (
    item_id             TEXT        PRIMARY KEY,
    name                TEXT        NOT NULL,
    sku                 TEXT,
    attributes          JSONB       DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_event_id TEXT        NOT NULL,
    version             BIGINT      NOT NULL DEFAULT 1
);

CREATE INDEX idx_item_list_sku ON item_list (sku) WHERE sku IS NOT NULL;
