-- Week 5: AP Invoice Lifecycle
-- AP projection tables: invoice list, aging, vendor balance, GL postings

-- ── 1. AP Invoice List ──
CREATE TABLE IF NOT EXISTS ap_invoice_list (
  invoice_id      TEXT PRIMARY KEY,
  invoice_number  TEXT NOT NULL,
  vendor_id       TEXT NOT NULL,
  vendor_name     TEXT NOT NULL,
  po_id           TEXT,
  po_number       TEXT,
  amount          NUMERIC(18,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  due_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'submitted',
  submitted_by_id   TEXT,
  submitted_by_name TEXT,
  approved_by_id    TEXT,
  approved_by_name  TEXT,
  rejection_reason  TEXT,
  payment_reference TEXT,
  payment_date      DATE,
  match_variance    NUMERIC(18,2),
  legal_entity    TEXT NOT NULL DEFAULT 'default',
  last_event_id   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ap_invoice_list_vendor
  ON ap_invoice_list (vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoice_list_status
  ON ap_invoice_list (status);
CREATE INDEX IF NOT EXISTS idx_ap_invoice_list_legal_entity
  ON ap_invoice_list (legal_entity);
CREATE INDEX IF NOT EXISTS idx_ap_invoice_list_due_date
  ON ap_invoice_list (due_date);

-- ── 2. AP Aging ──
CREATE TABLE IF NOT EXISTS ap_aging (
  id              TEXT PRIMARY KEY,
  legal_entity    TEXT NOT NULL DEFAULT 'default',
  vendor_id       TEXT NOT NULL,
  invoice_id      TEXT NOT NULL UNIQUE,
  amount          NUMERIC(18,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  due_date        DATE NOT NULL,
  aging_bucket    TEXT NOT NULL DEFAULT 'current',
  status          TEXT NOT NULL DEFAULT 'open',
  last_event_id   TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ap_aging_legal_entity
  ON ap_aging (legal_entity);
CREATE INDEX IF NOT EXISTS idx_ap_aging_bucket
  ON ap_aging (aging_bucket);
CREATE INDEX IF NOT EXISTS idx_ap_aging_vendor
  ON ap_aging (vendor_id);

-- ── 3. AP Vendor Balance ──
CREATE TABLE IF NOT EXISTS ap_vendor_balance (
  vendor_id         TEXT NOT NULL,
  legal_entity      TEXT NOT NULL DEFAULT 'default',
  outstanding_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  invoice_count     INTEGER NOT NULL DEFAULT 0,
  last_event_id     TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vendor_id, legal_entity)
);

-- ── 4. GL Postings ──
CREATE TABLE IF NOT EXISTS gl_postings (
  posting_id      TEXT PRIMARY KEY,
  legal_entity    TEXT NOT NULL DEFAULT 'default',
  event_id        TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  invoice_id      TEXT NOT NULL,
  account_code    TEXT NOT NULL,
  debit           NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  description     TEXT,
  posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gl_postings_legal_entity
  ON gl_postings (legal_entity);
CREATE INDEX IF NOT EXISTS idx_gl_postings_account_code
  ON gl_postings (account_code);
CREATE INDEX IF NOT EXISTS idx_gl_postings_invoice
  ON gl_postings (invoice_id);

-- ── 5. RLS Policies ──
ALTER TABLE ap_invoice_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_aging ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_vendor_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ap_invoice_list_legal_entity ON ap_invoice_list
  USING (legal_entity = current_setting('app.legal_entity', true));
CREATE POLICY ap_aging_legal_entity ON ap_aging
  USING (legal_entity = current_setting('app.legal_entity', true));
CREATE POLICY ap_vendor_balance_legal_entity ON ap_vendor_balance
  USING (legal_entity = current_setting('app.legal_entity', true));
CREATE POLICY gl_postings_legal_entity ON gl_postings
  USING (legal_entity = current_setting('app.legal_entity', true));

-- ── 6. Grant nova_app access ──
GRANT SELECT, INSERT, UPDATE, DELETE ON ap_invoice_list TO nova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ap_aging TO nova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ap_vendor_balance TO nova_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON gl_postings TO nova_app;
