-- Week 3: Security, Approvals, and Scope
-- Reverts effective_date to DATE, adds intents table, legal_entity columns, RLS

-- ── 1. Revert effective_date to DATE (spec §11.1: "Date, no time component") ──
ALTER TABLE events ALTER COLUMN effective_date TYPE DATE USING effective_date::date;

-- ── 2. Intents table — persists intent lifecycle ──
CREATE TABLE IF NOT EXISTS intents (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','validated','pending_approval','approved','executed','rejected','failed')),
  actor_id        TEXT NOT NULL,
  actor_name      TEXT NOT NULL,
  actor_type      TEXT NOT NULL,
  legal_entity    TEXT NOT NULL DEFAULT 'default',
  data            JSONB NOT NULL DEFAULT '{}',
  -- Approval fields
  required_approver_role TEXT,
  approved_by_id  TEXT,
  approved_by_name TEXT,
  approval_reason TEXT,
  rejected_by_id  TEXT,
  rejected_by_name TEXT,
  rejection_reason TEXT,
  -- Result fields
  result_event_id TEXT,
  result_error    TEXT,
  -- Metadata
  correlation_id  TEXT,
  idempotency_key TEXT,
  effective_date  DATE,
  occurred_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intents_status ON intents (status);
CREATE INDEX IF NOT EXISTS idx_intents_actor ON intents (actor_id);
CREATE INDEX IF NOT EXISTS idx_intents_legal_entity ON intents (legal_entity);

-- ── 3. Add legal_entity to entities table ──
ALTER TABLE entities ADD COLUMN IF NOT EXISTS legal_entity TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_entities_legal_entity ON entities (legal_entity);

-- ── 4. Add legal_entity to projection tables ──
ALTER TABLE vendor_list ADD COLUMN IF NOT EXISTS legal_entity TEXT NOT NULL DEFAULT 'default';
ALTER TABLE item_list ADD COLUMN IF NOT EXISTS legal_entity TEXT NOT NULL DEFAULT 'default';

-- ── 5. Enable RLS on projection tables ──
ALTER TABLE vendor_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_list ENABLE ROW LEVEL SECURITY;

-- RLS policies: filter by app.current_legal_entity session variable
CREATE POLICY vendor_list_le_policy ON vendor_list
  USING (legal_entity = current_setting('app.current_legal_entity', true));

CREATE POLICY item_list_le_policy ON item_list
  USING (legal_entity = current_setting('app.current_legal_entity', true));

-- ── 6. Create nova_app role (non-superuser, needed for RLS enforcement) ──
-- Superusers bypass RLS, so we need a non-superuser role for query paths
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nova_app') THEN
    CREATE ROLE nova_app NOLOGIN;
  END IF;
END
$$;

-- Grant nova_app access to all tables needed for queries
GRANT USAGE ON SCHEMA public TO nova_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO nova_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nova_app;
