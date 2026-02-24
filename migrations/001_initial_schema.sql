-- ════════════════════════════════════════════════════════════════
-- NOVA WALKING SKELETON — INITIAL SCHEMA
-- Phase 0.1, Week 1
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────
-- EVENTS TABLE (non-partitioned for Week 1)
-- ────────────────────────────────────────────────────

CREATE TABLE events (
    -- Identity
    id              TEXT        PRIMARY KEY,            -- ULID
    sequence        BIGINT      GENERATED ALWAYS AS IDENTITY,

    -- Classification
    type            TEXT        NOT NULL,               -- "module.entity.action"
    schema_version  SMALLINT    NOT NULL DEFAULT 1,

    -- Temporal
    occurred_at     TIMESTAMPTZ NOT NULL,               -- When the real-world event happened
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- When system recorded it
    effective_date  DATE        NOT NULL,               -- Business effective date

    -- Scope
    tenant_id       TEXT        NOT NULL DEFAULT 'default',
    legal_entity    TEXT        NOT NULL DEFAULT 'default',

    -- Actor
    actor_type      TEXT        NOT NULL,
    actor_id        TEXT        NOT NULL,
    actor_name      TEXT        NOT NULL,

    -- Causality & Correlation
    caused_by       TEXT,                               -- Parent event ID
    intent_id       TEXT,                               -- Intent that generated this
    correlation_id  TEXT        NOT NULL,               -- Business process correlation

    -- Business Data
    data            JSONB       NOT NULL,               -- Event-type-specific payload

    -- Dimensions
    dimensions      JSONB       DEFAULT '{}',

    -- Entity References
    entity_refs     JSONB       DEFAULT '[]',           -- Array of {entity_type, entity_id, role}

    -- Metadata
    rules_evaluated JSONB       DEFAULT '[]',
    tags            TEXT[]      DEFAULT '{}',
    source_system   TEXT        NOT NULL DEFAULT 'nova',
    source_channel  TEXT        NOT NULL DEFAULT 'api',
    source_ref      TEXT,

    -- Idempotency
    idempotency_key TEXT,

    -- Constraints
    CONSTRAINT valid_actor_type CHECK (actor_type IN ('human', 'agent', 'system', 'external', 'import'))
);

-- ────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────

CREATE INDEX idx_events_occurred
    ON events (occurred_at DESC);

CREATE INDEX idx_events_type
    ON events (type, occurred_at DESC);

CREATE INDEX idx_events_correlation
    ON events (correlation_id, occurred_at);

CREATE INDEX idx_events_caused_by
    ON events (caused_by) WHERE caused_by IS NOT NULL;

CREATE INDEX idx_events_intent
    ON events (intent_id, occurred_at) WHERE intent_id IS NOT NULL;

CREATE INDEX idx_events_entity_refs
    ON events USING GIN (entity_refs jsonb_path_ops);

CREATE INDEX idx_events_tags
    ON events USING GIN (tags);

CREATE INDEX idx_events_dimensions
    ON events USING GIN (dimensions jsonb_path_ops);

CREATE INDEX idx_events_actor
    ON events (actor_id, occurred_at DESC);

CREATE UNIQUE INDEX idx_events_idempotency_key
    ON events (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_events_sequence
    ON events (sequence);

-- ────────────────────────────────────────────────────
-- NOTIFY TRIGGER (ADR-008: events table as outbox)
-- ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_event_appended()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('event_appended', json_build_object(
        'id', NEW.id,
        'type', NEW.type,
        'sequence', NEW.sequence
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_appended
    AFTER INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION notify_event_appended();


-- ════════════════════════════════════════════════════════════════
-- ENTITIES TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE entities (
    entity_id       TEXT        NOT NULL,
    entity_type     TEXT        NOT NULL,
    attributes      JSONB       NOT NULL DEFAULT '{}',
    version         BIGINT      NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX idx_entities_type ON entities (entity_type);


-- ════════════════════════════════════════════════════════════════
-- ENTITY RELATIONSHIPS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE entity_relationships (
    source_type         TEXT        NOT NULL,
    source_id           TEXT        NOT NULL,
    target_type         TEXT        NOT NULL,
    target_id           TEXT        NOT NULL,
    relationship_type   TEXT        NOT NULL,
    attributes          JSONB       DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (source_type, source_id, target_type, target_id, relationship_type),
    FOREIGN KEY (source_type, source_id) REFERENCES entities (entity_type, entity_id),
    FOREIGN KEY (target_type, target_id) REFERENCES entities (entity_type, entity_id)
);


-- ════════════════════════════════════════════════════════════════
-- EVENT SUBSCRIPTIONS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE event_subscriptions (
    id                  TEXT        PRIMARY KEY,
    subscriber_type     TEXT        NOT NULL,       -- "projection" | "agent" | "rule" | "webhook"
    subscriber_id       TEXT        NOT NULL,

    -- Filter
    event_types         TEXT[],                     -- NULL = all types
    legal_entities      TEXT[],                     -- NULL = all entities

    -- Cursor
    last_processed_id   TEXT,
    last_processed_seq  BIGINT      DEFAULT 0,

    -- Status
    status              TEXT        NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Error tracking
    error_count         INTEGER     DEFAULT 0,
    last_error          TEXT,
    last_error_at       TIMESTAMPTZ
);

CREATE INDEX idx_subscriptions_status
    ON event_subscriptions (status) WHERE status = 'active';


-- ════════════════════════════════════════════════════════════════
-- VENDOR LIST PROJECTION TABLE
-- ════════════════════════════════════════════════════════════════

CREATE TABLE vendor_list (
    vendor_id           TEXT        PRIMARY KEY,
    name                TEXT        NOT NULL,
    attributes          JSONB       DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_event_id TEXT        NOT NULL,
    version             BIGINT      NOT NULL DEFAULT 1
);
