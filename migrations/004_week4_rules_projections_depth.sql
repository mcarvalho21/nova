-- Week 4: Rules & Projections Depth
-- Event type registry, projection snapshots, dead-letter, subscription management

-- ── 1. Event Type Registry ──
CREATE TABLE IF NOT EXISTS event_type_registry (
  type_name       TEXT NOT NULL,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  json_schema     JSONB NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (type_name, schema_version)
);

-- ── 2. Projection Snapshots ──
CREATE TABLE IF NOT EXISTS projection_snapshots (
  snapshot_id     TEXT PRIMARY KEY,
  projection_type TEXT NOT NULL,
  sequence_number BIGINT NOT NULL,
  snapshot_data   JSONB NOT NULL,
  is_stale        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projection_snapshots_type_seq
  ON projection_snapshots (projection_type, sequence_number DESC);

-- ── 3. Dead-Letter Events ──
CREATE TABLE IF NOT EXISTS dead_letter_events (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL,
  event_sequence  BIGINT,
  projection_type TEXT NOT NULL,
  error_message   TEXT NOT NULL,
  error_stack     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_projection
  ON dead_letter_events (projection_type, created_at DESC);

-- ── 4. Enhance event_subscriptions for subscription management ──
-- Add projection_type column (maps subscriber to a named projection)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_subscriptions' AND column_name = 'projection_type'
  ) THEN
    ALTER TABLE event_subscriptions ADD COLUMN projection_type TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_projection_type
  ON event_subscriptions (projection_type);

-- Add batch_size column for configurable replay batching
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_subscriptions' AND column_name = 'batch_size'
  ) THEN
    ALTER TABLE event_subscriptions ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 100;
  END IF;
END $$;

-- Add CHECK constraint on status if it doesn't already have one covering 'resetting'
-- The initial schema has status column but may not have 'resetting' as valid value
DO $$
BEGIN
  -- Drop existing check constraint on status if any, then re-add with resetting
  BEGIN
    ALTER TABLE event_subscriptions DROP CONSTRAINT IF EXISTS event_subscriptions_status_check;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  ALTER TABLE event_subscriptions ADD CONSTRAINT event_subscriptions_status_check
    CHECK (status IN ('active', 'paused', 'resetting'));
END $$;

-- ── 5. Grant nova_app access to new tables ──
GRANT SELECT, INSERT, UPDATE, DELETE ON event_type_registry TO nova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON projection_snapshots TO nova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON dead_letter_events TO nova_app;
