# 01 — Event Store: Deep Implementation Specification

**Component:** Core Engine — Event Store  
**Dependencies:** None (this is the foundational layer)  
**Depended on by:** Entity Graph, Rules Engine, Projection Engine, Intent Protocol, all business capabilities  

---

## 1. Overview

The Event Store is the heart of Project Nova — an append-only, immutable log of every fact that has ever occurred in the system. All state is derived from events. The event store IS the system of record, the audit trail, and the source of truth simultaneously.

### 1.1 Design Principles

1. **Append-only**: Events are never updated or deleted. Corrections are made by appending compensating events.
2. **Immutable**: Once written, an event's data cannot change. This guarantees audit integrity.
3. **Ordered**: Events within a partition are strictly ordered. Cross-partition ordering is eventual.
4. **Partitioned**: Events are physically partitioned by legal entity for performance and data isolation.
5. **Subscriptable**: Consumers can subscribe to event streams for real-time processing.
6. **Replayable**: Any projection can be rebuilt by replaying events from the beginning or a snapshot.

---

## 2. Data Model

### 2.1 Core Event Type

```typescript
// Base event interface — all events in the system extend this
interface BaseEvent {
  // ──── Identity ────
  id: string;                          // ULID — globally unique, time-sortable
  sequence: bigint;                    // Monotonically increasing within partition
  
  // ──── Classification ────
  type: string;                        // Namespaced: "module.entity.action"
                                       // e.g., "ap.invoice.submitted", "gl.journal.posted"
  schema_version: number;              // Schema version for this event type (for evolution)
  
  // ──── Temporal ────
  occurred_at: DateTime;               // When the real-world event happened
  recorded_at: DateTime;               // When the system recorded it (always server time)
  effective_date: Date;                // Business effective date (may differ from occurred_at)
                                       // e.g., a journal backdated to end of prior period
  
  // ──── Organizational Scope ────
  scope: EventScope;
  
  // ──── Actor ────
  actor: EventActor;
  
  // ──── Causality & Correlation ────
  caused_by?: string;                  // ID of the parent event that caused this one
  intent_id?: string;                  // ID of the intent that generated this event
  correlation_id: string;              // Groups all events in a business process
                                       // e.g., all events in a procure-to-pay chain share one
  
  // ──── Business Data ────
  data: Record<string, unknown>;       // Event-type-specific payload (see Event Schemas below)
  
  // ──── Dimensional Context ────
  dimensions: Record<string, string>;  // Financial/analytical dimensions
                                       // e.g., { department: "ENG", cost_center: "CC-4200" }
  
  // ──── Entity References ────
  entities: EntityReference[];         // Which entities this event relates to
                                       // Enables entity-stream queries
  
  // ──── Metadata ────
  metadata: EventMetadata;
}

interface EventScope {
  tenant_id: string;                   // Multi-tenant isolation (top-level)
  legal_entity: string;                // Primary partition key
  division?: string;                   // Optional organizational scope
  region?: string;                     // Optional geographic scope
  site?: string;                       // Optional site/facility scope
  custom_scopes?: Record<string, string>;  // Extensible scope dimensions
}

interface EventActor {
  type: "human" | "agent" | "system" | "external" | "import";
  id: string;                          // Identity reference
  name: string;                        // Display name (for audit readability)
  on_behalf_of?: {                     // Delegation chain
    type: string;
    id: string;
    name: string;
  };
  session_id?: string;                 // For human actors: session tracking
  trust_level?: string;                // For agents: trust level at time of action
  ip_address?: string;                 // For human actors: source IP (for security audit)
}

interface EntityReference {
  entity_type: string;                 // e.g., "vendor", "purchase_order", "item"
  entity_id: string;                   // Entity ID
  role: string;                        // The entity's role in this event
                                       // e.g., "subject", "counterparty", "approver"
}

interface EventMetadata {
  // Rule evaluation trace
  rules_evaluated: RuleEvaluationSummary[];
  
  // PII tracking
  pii_fields: string[];                // Which fields in data contain PII
  pii_classes: Record<string, string>; // field_path → pii_class mapping
  
  // Integrity
  checksum: string;                    // SHA-256 of (id + type + data + scope + actor)
  previous_checksum?: string;          // Checksum of the previous event in this partition
                                       // Creates a hash chain for tamper detection
  
  // Classification tags
  tags: string[];                      // Searchable tags for cross-cutting concerns
  
  // Source tracking
  source: {
    system: string;                    // "nova" | "import" | "migration" | "external_system_name"
    channel: string;                   // "web_ui" | "api" | "conversational" | "agent" | "batch"
    reference?: string;                // External reference (e.g., original document number)
  };
}

interface RuleEvaluationSummary {
  rule_id: string;
  rule_name: string;
  result: "fired" | "not_applicable" | "condition_false";
  actions_taken?: string[];
  evaluation_ms: number;
}
```

### 2.2 Event Type Registry

Every event type must be registered with a schema before events of that type can be appended:

```typescript
interface EventTypeRegistration {
  // ──── Identity ────
  type: string;                        // Fully qualified: "module.entity.action"
  schema_version: number;              // Current version
  
  // ──── Module ────
  module: string;                      // Which capability module owns this event type
  
  // ──── Schema ────
  data_schema: JSONSchema;             // JSON Schema for the event's data field
  
  // ──── Required Dimensions ────
  required_dimensions: string[];       // Which dimensions must be present
  optional_dimensions: string[];       // Which dimensions are recognized but optional
  
  // ──── Required Entity References ────
  required_entity_refs: {
    entity_type: string;
    role: string;
    cardinality: "one" | "one_or_more";
  }[];
  
  // ──── PII Declaration ────
  pii_fields: {
    field_path: string;                // JSONPath to the PII field in data
    pii_class: string;                 // Classification
  }[];
  
  // ──── Retention ────
  retention_class: "standard" | "regulatory" | "pii_subject";
  minimum_retention_years?: number;
  
  // ──── Schema Evolution ────
  previous_versions: {
    version: number;
    migration: string;                 // Reference to migration function
    deprecated_at: DateTime;
  }[];
  
  // ──── Documentation ────
  description: string;
  examples: Record<string, unknown>[]; // Example event payloads
}
```

### 2.3 Example Event Type Schemas

```typescript
// ──── AP Invoice Submitted ────
const invoiceSubmittedSchema: EventTypeRegistration = {
  type: "ap.invoice.submitted",
  schema_version: 1,
  module: "accounts_payable",
  
  data_schema: {
    type: "object",
    required: ["invoice_number", "vendor_id", "invoice_date", "due_date",
               "currency", "total_amount", "lines"],
    properties: {
      invoice_number: { type: "string", maxLength: 50 },
      vendor_id: { type: "string" },
      vendor_name: { type: "string" },
      invoice_date: { type: "string", format: "date" },
      due_date: { type: "string", format: "date" },
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
      total_amount: { type: "number", minimum: 0 },
      tax_amount: { type: "number", minimum: 0 },
      description: { type: "string", maxLength: 500 },
      po_reference: { type: "string" },  // null for non-PO invoices
      external_reference: { type: "string" },
      
      lines: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["line_number", "amount"],
          properties: {
            line_number: { type: "integer", minimum: 1 },
            description: { type: "string" },
            quantity: { type: "number" },
            unit_price: { type: "number" },
            amount: { type: "number" },
            account: { type: "string" },
            tax_group: { type: "string" },
            po_line_reference: { type: "string" },
            item_id: { type: "string" },
            dimensions: {
              type: "object",
              additionalProperties: { type: "string" }
            }
          }
        }
      },
      
      attachments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            filename: { type: "string" },
            content_type: { type: "string" },
            size_bytes: { type: "integer" }
          }
        }
      }
    }
  },
  
  required_dimensions: ["department"],
  optional_dimensions: ["cost_center", "project"],
  
  required_entity_refs: [
    { entity_type: "vendor", role: "subject", cardinality: "one" },
  ],
  
  pii_fields: [],  // Invoice data itself isn't PII
  
  retention_class: "regulatory",
  minimum_retention_years: 7,
  
  description: "Vendor invoice submitted for processing. May reference a PO or be a non-PO invoice.",
  examples: [
    {
      invoice_number: "INV-2025-001234",
      vendor_id: "V-1042",
      vendor_name: "Contoso Supply Ltd",
      invoice_date: "2025-03-15",
      due_date: "2025-04-14",
      currency: "USD",
      total_amount: 12500.00,
      tax_amount: 0,
      description: "Raw materials order - March delivery",
      po_reference: "PO-2025-00891",
      lines: [
        {
          line_number: 1,
          description: "Widget Component A",
          quantity: 500,
          unit_price: 25.00,
          amount: 12500.00,
          account: "5100",
          po_line_reference: "PO-2025-00891-1",
          item_id: "ITEM-4820",
          dimensions: { department: "PROD", cost_center: "CC-5100" }
        }
      ]
    }
  ]
};

// ──── GL Journal Posted ────
const journalPostedSchema: EventTypeRegistration = {
  type: "gl.journal.posted",
  schema_version: 1,
  module: "general_ledger",
  
  data_schema: {
    type: "object",
    required: ["journal_number", "description", "lines"],
    properties: {
      journal_number: { type: "string" },
      journal_type: { 
        type: "string",
        enum: ["general", "allocation", "revaluation", "closing", 
               "opening", "reversal", "intercompany", "subledger"]
      },
      description: { type: "string", maxLength: 500 },
      reversal_date: { type: "string", format: "date" },
      recurring_id: { type: "string" },
      source_module: { type: "string" },  // Which module generated this posting
      source_event_id: { type: "string" }, // The business event that triggered this GL posting
      
      lines: {
        type: "array",
        minItems: 2,  // Must have at least debit + credit
        items: {
          type: "object",
          required: ["line_number", "account", "debit_credit", "amount", "currency"],
          properties: {
            line_number: { type: "integer", minimum: 1 },
            account: { type: "string" },
            account_name: { type: "string" },
            debit_credit: { type: "string", enum: ["debit", "credit"] },
            amount: { type: "number", minimum: 0 },
            currency: { type: "string", pattern: "^[A-Z]{3}$" },
            amount_in_reporting_currency: { type: "number" },
            exchange_rate: { type: "number" },
            description: { type: "string" },
            dimensions: {
              type: "object",
              additionalProperties: { type: "string" }
            }
          }
        }
      },
      
      // Validation: total debits must equal total credits
      total_debit: { type: "number" },
      total_credit: { type: "number" }
    }
  },
  
  required_dimensions: ["department"],
  optional_dimensions: ["cost_center", "project", "customer", "vendor"],
  
  required_entity_refs: [],
  
  pii_fields: [],
  
  retention_class: "regulatory",
  minimum_retention_years: 7,
  
  description: "General ledger journal entry posted. Debits must equal credits."
};
```

---

## 3. Database Schema

### 3.1 Event Store Tables

```sql
-- ════════════════════════════════════════════════════════════════
-- EVENT STORE CORE TABLES
-- ════════════════════════════════════════════════════════════════

-- Main event table — partitioned by legal_entity for performance and isolation
CREATE TABLE events (
    -- Identity
    id              TEXT        NOT NULL,       -- ULID
    sequence        BIGINT      GENERATED ALWAYS AS IDENTITY,
    
    -- Classification
    type            TEXT        NOT NULL,       -- "module.entity.action"
    schema_version  SMALLINT    NOT NULL DEFAULT 1,
    
    -- Temporal
    occurred_at     TIMESTAMPTZ NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_date  DATE        NOT NULL,
    
    -- Scope (partition key is legal_entity)
    tenant_id       TEXT        NOT NULL,
    legal_entity    TEXT        NOT NULL,
    division        TEXT,
    region          TEXT,
    site            TEXT,
    custom_scopes   JSONB       DEFAULT '{}',
    
    -- Actor
    actor_type      TEXT        NOT NULL,       -- "human" | "agent" | "system" | "external" | "import"
    actor_id        TEXT        NOT NULL,
    actor_name      TEXT        NOT NULL,
    actor_details   JSONB       DEFAULT '{}',   -- on_behalf_of, session_id, trust_level, ip_address
    
    -- Causality
    caused_by       TEXT,                       -- Parent event ID
    intent_id       TEXT,                       -- Intent that generated this
    correlation_id  TEXT        NOT NULL,       -- Business process correlation
    
    -- Business Data
    data            JSONB       NOT NULL,       -- Event-type-specific payload
    
    -- Dimensions
    dimensions      JSONB       DEFAULT '{}',
    
    -- Entity References
    entity_refs     JSONB       DEFAULT '[]',   -- Array of {entity_type, entity_id, role}
    
    -- Metadata
    rules_evaluated JSONB       DEFAULT '[]',
    pii_fields      TEXT[]      DEFAULT '{}',
    pii_classes     JSONB       DEFAULT '{}',
    tags            TEXT[]      DEFAULT '{}',
    source_system   TEXT        NOT NULL DEFAULT 'nova',
    source_channel  TEXT        NOT NULL DEFAULT 'api',
    source_ref      TEXT,
    
    -- Idempotency (prevents duplicate event creation from retries)
    idempotency_key TEXT,                   -- Client-provided key for intent-level deduplication
    
    -- Concurrency Control
    -- When an intent modifies an entity, it includes the expected entity version.
    -- The append function verifies the version hasn't advanced since the intent read it.
    -- See Section 4.1 appendWithConcurrencyCheck() for implementation.
    expected_entity_version BIGINT,         -- NULL for events not tied to entity mutation
    
    -- Integrity
    checksum        TEXT        NOT NULL,
    prev_checksum   TEXT,
    
    -- Constraints
    PRIMARY KEY (legal_entity, id),
    
    -- Immutability: no UPDATE or DELETE triggers will be set
    CONSTRAINT valid_actor_type CHECK (actor_type IN ('human', 'agent', 'system', 'external', 'import'))
    
) PARTITION BY LIST (legal_entity);

-- Create a partition for each legal entity (done dynamically when entities are configured)
-- Example:
-- CREATE TABLE events_usmf PARTITION OF events FOR VALUES IN ('USMF');
-- CREATE TABLE events_gbuk PARTITION OF events FOR VALUES IN ('GBUK');

-- ────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────

-- Primary lookup: events by ID (covered by PK)
-- Time-range queries within a legal entity
CREATE INDEX idx_events_occurred 
    ON events (legal_entity, occurred_at DESC);

CREATE INDEX idx_events_effective_date 
    ON events (legal_entity, effective_date DESC);

-- Event type queries (e.g., "all invoice_submitted events")
CREATE INDEX idx_events_type 
    ON events (legal_entity, type, occurred_at DESC);

-- Correlation queries (e.g., "all events in this P2P chain")
CREATE INDEX idx_events_correlation 
    ON events (correlation_id, occurred_at);

-- Causality queries (e.g., "what events did this event cause?")
CREATE INDEX idx_events_caused_by 
    ON events (caused_by) WHERE caused_by IS NOT NULL;

-- Intent queries (e.g., "what events came from this intent?")
CREATE INDEX idx_events_intent 
    ON events (intent_id, occurred_at) WHERE intent_id IS NOT NULL;

-- Entity reference queries (e.g., "all events for vendor V-1042")
-- Uses GIN index on the JSONB array
CREATE INDEX idx_events_entity_refs 
    ON events USING GIN (entity_refs jsonb_path_ops);

-- Tag queries
CREATE INDEX idx_events_tags 
    ON events USING GIN (tags);

-- Dimension queries (e.g., "all events for department ENG")
CREATE INDEX idx_events_dimensions 
    ON events USING GIN (dimensions jsonb_path_ops);

-- Actor queries (for security audit: "what did user X do?")
CREATE INDEX idx_events_actor 
    ON events (actor_id, occurred_at DESC);

-- Division scoping (for record-level security)
CREATE INDEX idx_events_division 
    ON events (legal_entity, division, occurred_at DESC) WHERE division IS NOT NULL;

-- Idempotency key deduplication (unique within a time window)
CREATE UNIQUE INDEX idx_events_idempotency_key
    ON events (legal_entity, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ────────────────────────────────────────────────────
-- NATURAL BUSINESS KEY DEDUPLICATION INDEXES
-- Prevents logical duplicate events (same business document submitted twice)
-- Each event type with business key semantics gets its own partial unique index.
-- ────────────────────────────────────────────────────

-- AP invoice: one invoice per vendor per invoice number per legal entity
CREATE UNIQUE INDEX idx_dedup_ap_invoice
    ON events (legal_entity, (data->>'vendor_id'), (data->>'invoice_number'))
    WHERE type = 'ap.invoice.submitted';

-- GL journal: one journal per journal number per legal entity
CREATE UNIQUE INDEX idx_dedup_gl_journal
    ON events (legal_entity, (data->>'journal_number'))
    WHERE type = 'gl.journal.posted';

-- Payment: one event per payment_id per legal entity
CREATE UNIQUE INDEX idx_dedup_payment
    ON events (legal_entity, (data->>'payment_id'))
    WHERE type = 'payment.executed';


-- ════════════════════════════════════════════════════════════════
-- EVENT TYPE REGISTRY
-- ════════════════════════════════════════════════════════════════

CREATE TABLE event_type_registry (
    type                TEXT        NOT NULL,
    schema_version      SMALLINT    NOT NULL,
    module              TEXT        NOT NULL,
    data_schema         JSONB       NOT NULL,       -- JSON Schema
    required_dimensions TEXT[]      DEFAULT '{}',
    optional_dimensions TEXT[]      DEFAULT '{}',
    required_entity_refs JSONB      DEFAULT '[]',
    pii_fields          JSONB       DEFAULT '[]',
    retention_class     TEXT        NOT NULL DEFAULT 'standard',
    min_retention_years SMALLINT,
    description         TEXT,
    examples            JSONB       DEFAULT '[]',
    
    -- Schema evolution
    previous_versions   JSONB       DEFAULT '[]',
    
    -- Metadata
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registered_by       TEXT        NOT NULL,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    
    PRIMARY KEY (type, schema_version)
);


-- ════════════════════════════════════════════════════════════════
-- EVENT SUBSCRIPTIONS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE event_subscriptions (
    id                  TEXT        PRIMARY KEY,
    subscriber_type     TEXT        NOT NULL,       -- "projection" | "agent" | "rule" | "webhook"
    subscriber_id       TEXT        NOT NULL,       -- ID of the subscribing component
    
    -- Filter: which events this subscription receives
    event_types         TEXT[],                     -- NULL = all types
    legal_entities      TEXT[],                     -- NULL = all entities
    scopes              JSONB,                      -- Additional scope filters
    
    -- Cursor: where this subscription is in the stream
    last_processed_id   TEXT,                       -- Last event ID processed
    last_processed_seq  BIGINT,                     -- Last sequence number processed
    
    -- Status
    status              TEXT        NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Error tracking
    error_count         INTEGER     DEFAULT 0,
    last_error          TEXT,
    last_error_at       TIMESTAMPTZ
);

CREATE INDEX idx_subscriptions_status ON event_subscriptions (status) WHERE status = 'active';


-- ════════════════════════════════════════════════════════════════
-- EVENT SNAPSHOTS (for projection rebuild optimization)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE event_snapshots (
    id                  TEXT        PRIMARY KEY,
    stream_type         TEXT        NOT NULL,       -- "entity" | "scope" | "type" | "correlation"
    stream_id           TEXT        NOT NULL,       -- Identifier for the specific stream
    snapshot_at         TIMESTAMPTZ NOT NULL,       -- Point in time of snapshot
    last_event_id       TEXT        NOT NULL,       -- Last event included in snapshot
    last_event_seq      BIGINT      NOT NULL,
    
    projection_id       TEXT        NOT NULL,       -- Which projection this snapshot is for
    state               JSONB       NOT NULL,       -- Serialized projection state
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (stream_type, stream_id, projection_id, snapshot_at)
);

CREATE INDEX idx_snapshots_lookup 
    ON event_snapshots (stream_type, stream_id, projection_id, snapshot_at DESC);


-- ════════════════════════════════════════════════════════════════
-- IMMUTABILITY ENFORCEMENT
-- ════════════════════════════════════════════════════════════════

-- Prevent UPDATE on events table
CREATE OR REPLACE FUNCTION prevent_event_update()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Events are immutable. Cannot update event %.', OLD.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_no_update
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_event_update();

-- Prevent DELETE on events table (except for PII redaction, which has a special path)
CREATE OR REPLACE FUNCTION prevent_event_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow PII redaction (data field update only, everything else preserved)
    -- This is handled by the PII redaction system, not direct DELETE
    RAISE EXCEPTION 'Events are immutable. Cannot delete event %.', OLD.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_no_delete
    BEFORE DELETE ON events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_event_delete();


-- ════════════════════════════════════════════════════════════════
-- NOTIFICATION SYSTEM (for real-time subscriptions)
-- ════════════════════════════════════════════════════════════════

-- IMPORTANT: PostgreSQL NOTIFY has an 8,000-byte payload limit.
-- The NOTIFY payload is a WAKEUP SIGNAL ONLY — it contains just enough
-- information for consumers to know which partition has new events.
-- Consumers then pull the actual event data via SELECT from their cursor position.
-- NEVER put event data, entity attributes, or business payload in the NOTIFY.

-- Trigger to notify subscribers when a new event is appended
CREATE OR REPLACE FUNCTION notify_event_appended()
RETURNS TRIGGER AS $$
BEGIN
    -- Minimal wakeup signal — ~50 bytes, well under 8KB limit
    PERFORM pg_notify(
        'event_appended',
        json_build_object(
            'partition', NEW.legal_entity,
            'sequence', NEW.sequence
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_notify_on_insert
    AFTER INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION notify_event_appended();
```

### 3.2 PII Protection: Crypto-Shredding (Primary) and Redaction (Fallback)

**Primary mechanism: Crypto-shredding.** Every data subject gets a unique data encryption key (DEK). PII fields are encrypted with the subject's DEK **synchronously on the write path, before the INSERT** — plaintext PII must never reach PostgreSQL's WAL, replicas, or backups. On deletion request, the DEK is destroyed, rendering all encrypted PII fields permanently unreadable while preserving the event skeleton.

**Fallback mechanism: Field redaction.** SQL-based redaction remains for edge cases: pre-implementation events, migrated historical data, and fields that escaped PII classification. This is the ONLY modification allowed on the events table.

```sql
-- ════════════════════════════════════════════════════════════════
-- CRYPTO-SHREDDING SUPPORT TABLES
-- ════════════════════════════════════════════════════════════════

-- Data Encryption Keys (DEKs) — one per data subject, encrypted by KMS KEK
-- This table is MUTABLE (unlike the event store). Keys can be destroyed.
CREATE TABLE data_subject_keys (
    data_subject_id TEXT        NOT NULL,   -- e.g., customer ID, vendor contact ID, employee ID
    tenant_id       TEXT        NOT NULL,
    legal_entity    TEXT        NOT NULL,
    
    -- Encrypted DEK (encrypted by KMS Key Encryption Key)
    encrypted_dek   BYTEA       NOT NULL,   -- AES-256 key, encrypted by KEK
    kek_id          TEXT        NOT NULL,   -- Which KEK was used (for rotation)
    
    -- Lifecycle
    status          TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'rotated' | 'destroyed'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at      TIMESTAMPTZ,
    destroyed_at    TIMESTAMPTZ,
    destruction_reason TEXT,                -- 'gdpr_erasure' | 'retention_expired' | 'subject_request'
    destruction_requested_by TEXT,
    destruction_approved_by  TEXT,
    
    PRIMARY KEY (tenant_id, legal_entity, data_subject_id),
    CONSTRAINT valid_status CHECK (status IN ('active', 'rotated', 'destroyed'))
);

-- Track which events contain PII for which data subjects
-- Enables targeted projection rebuild on key destruction
CREATE TABLE event_pii_subjects (
    event_id        TEXT        NOT NULL,
    legal_entity    TEXT        NOT NULL,
    data_subject_id TEXT        NOT NULL,
    pii_field_paths TEXT[]      NOT NULL,   -- Which fields in this event are PII for this subject
    
    PRIMARY KEY (legal_entity, event_id, data_subject_id),
    FOREIGN KEY (legal_entity, event_id) REFERENCES events (legal_entity, id)
);

CREATE INDEX idx_pii_subjects_lookup
    ON event_pii_subjects (data_subject_id, legal_entity);

-- Deletion request audit log
CREATE TABLE pii_deletion_log (
    id                  TEXT        PRIMARY KEY,
    data_subject_id     TEXT        NOT NULL,
    tenant_id           TEXT        NOT NULL,
    legal_entity        TEXT        NOT NULL,
    
    -- Request details
    reason              TEXT        NOT NULL,
    requested_by        TEXT        NOT NULL,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by         TEXT        NOT NULL,
    approved_at         TIMESTAMPTZ NOT NULL,
    
    -- Execution details
    key_destroyed_at    TIMESTAMPTZ,
    events_affected     INTEGER,            -- Count of events with PII for this subject
    projections_rebuilt TEXT[],              -- Which projections were rebuilt
    completed_at        TIMESTAMPTZ,
    status              TEXT        NOT NULL DEFAULT 'pending'
);

-- ════════════════════════════════════════════════════════════════
-- ENCRYPTION FLOW (application-level, not SQL)
-- ════════════════════════════════════════════════════════════════
--
-- ON EVENT APPEND (synchronous, before INSERT):
--   1. Identify PII fields from event type's PII manifest
--   2. For each data subject referenced in the event:
--      a. Fetch DEK from local cache (hit rate >95%)
--      b. On cache miss: fetch encrypted DEK from data_subject_keys table,
--         decrypt with KEK via KMS (one network call), cache locally with TTL
--      c. Encrypt each PII field with subject's DEK (AES-256-GCM, ~1ms)
--   3. INSERT event with encrypted PII fields + plaintext non-PII fields
--   4. INSERT mapping into event_pii_subjects for targeted rebuild tracking
--
-- CRITICAL: Encryption is SYNCHRONOUS on the write path. If plaintext PII
-- reaches PostgreSQL (even "temporarily"), it persists in WAL files, streaming
-- replication, and backups — defeating the entire purpose of crypto-shredding.
--
-- ON DELETION REQUEST:
--   1. Verify request (identity, authorization, approval)
--   2. UPDATE data_subject_keys SET status = 'destroyed', destroyed_at = NOW()
--      (destroy the encrypted DEK — the plaintext DEK exists only in memory/cache)
--   3. Purge DEK from all caches
--   4. Query event_pii_subjects for affected events
--   5. Trigger targeted rebuild of PII-containing projections
--   6. Projections attempt to decrypt → key destroyed → write '[REDACTED]'
--   7. Log completion in pii_deletion_log
--
-- Performance:
--   Cache hit (common): ~1ms overhead per event (local symmetric crypto only)
--   Cache miss (rare):  ~5-10ms (KMS call to unwrap DEK + crypto)
--   Expected cache hit rate: >95% (subjects accessed repeatedly within session)
```

**Fallback: SQL-based PII redaction** (for legacy/migration data only):

```sql
-- PII redaction table — tracks what was redacted and why
-- Used ONLY for events created before crypto-shredding was implemented
CREATE TABLE pii_redactions (
    id              TEXT        PRIMARY KEY,
    event_id        TEXT        NOT NULL,
    legal_entity    TEXT        NOT NULL,
    
    -- What was redacted
    redacted_fields TEXT[]      NOT NULL,       -- JSONPath of redacted fields
    
    -- Why
    reason          TEXT        NOT NULL,       -- "gdpr_deletion_request" | "retention_expired" | etc.
    data_subject_id TEXT,                       -- The person whose data was redacted
    
    -- Audit
    requested_by    TEXT        NOT NULL,
    approved_by     TEXT        NOT NULL,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- The original data is NOT stored here — it's gone
    -- Only the fact of redaction is preserved
    
    FOREIGN KEY (legal_entity, event_id) REFERENCES events (legal_entity, id)
);

-- Special function that ONLY redacts PII fields, preserving event structure
-- NOTE: This is the FALLBACK for pre-crypto-shredding events only.
-- For events created after crypto-shredding activation, use key destruction instead.
CREATE OR REPLACE FUNCTION redact_event_pii(
    p_event_id TEXT,
    p_legal_entity TEXT,
    p_fields TEXT[],
    p_reason TEXT,
    p_data_subject TEXT,
    p_requested_by TEXT,
    p_approved_by TEXT
) RETURNS VOID AS $$
DECLARE
    v_data JSONB;
    v_field TEXT;
BEGIN
    -- Get current event data
    SELECT data INTO v_data 
    FROM events 
    WHERE id = p_event_id AND legal_entity = p_legal_entity;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found: %', p_event_id;
    END IF;
    
    -- Redact each specified field
    FOREACH v_field IN ARRAY p_fields LOOP
        v_data := jsonb_set(
            v_data,
            string_to_array(v_field, '.'),
            '"[REDACTED]"'::jsonb
        );
    END LOOP;
    
    -- Temporarily disable the update trigger for this operation
    ALTER TABLE events DISABLE TRIGGER events_no_update;
    
    -- Update ONLY the data field and pii_fields metadata
    UPDATE events 
    SET data = v_data,
        pii_fields = array_append(pii_fields, 'REDACTED'),
        -- Note: checksum is intentionally NOT recalculated — 
        -- the mismatch serves as tamper evidence that redaction occurred
        tags = array_append(tags, 'pii_redacted')
    WHERE id = p_event_id AND legal_entity = p_legal_entity;
    
    -- Re-enable the trigger
    ALTER TABLE events ENABLE TRIGGER events_no_update;
    
    -- Record the redaction
    INSERT INTO pii_redactions (id, event_id, legal_entity, redacted_fields, 
                                reason, data_subject_id, requested_by, approved_by)
    VALUES (gen_ulid(), p_event_id, p_legal_entity, p_fields,
            p_reason, p_data_subject, p_requested_by, p_approved_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. TypeScript Implementation

### 4.1 Event Store Service

```typescript
// ════════════════════════════════════════════════════════════════
// EVENT STORE SERVICE — Core API
// ════════════════════════════════════════════════════════════════

import { Pool, PoolClient } from 'pg';
import { ulid } from 'ulid';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';

// ──── Configuration ────
interface EventStoreConfig {
  database: Pool;
  maxBatchSize: number;          // Max events in a single append batch
  snapshotInterval: number;      // Events between automatic snapshots
  notificationChannel: string;   // PostgreSQL NOTIFY channel
}

// ──── Error Types ────
class EventValidationError extends Error {
  constructor(
    message: string,
    public readonly eventType: string,
    public readonly violations: string[]
  ) {
    super(message);
    this.name = 'EventValidationError';
  }
}

class EventTypeNotRegisteredError extends Error {
  constructor(eventType: string) {
    super(`Event type "${eventType}" is not registered`);
    this.name = 'EventTypeNotRegisteredError';
  }
}

class ConcurrencyConflictError extends Error {
  constructor(
    public readonly streamId: string,
    public readonly expectedSequence: bigint,
    public readonly actualSequence: bigint
  ) {
    super(`Concurrency conflict on stream ${streamId}: expected ${expectedSequence}, got ${actualSequence}`);
    this.name = 'ConcurrencyConflictError';
  }
}

// ──── Event Store Service ────
class EventStoreService {
  private config: EventStoreConfig;
  private emitter: EventEmitter;
  private typeRegistry: Map<string, EventTypeRegistration>;
  
  constructor(config: EventStoreConfig) {
    this.config = config;
    this.emitter = new EventEmitter();
    this.typeRegistry = new Map();
    
    // Set up PostgreSQL LISTEN for real-time notifications
    this.setupNotificationListener();
  }
  
  // ════════════════════════════════════════
  // APPEND — Write events to the store
  // ════════════════════════════════════════
  
  /**
   * Append a single event to the store.
   * Validates against registered schema, computes checksum, assigns ID.
   */
  async append(event: Omit<BaseEvent, 'id' | 'sequence' | 'recorded_at' | 'metadata'> & {
    metadata?: Partial<EventMetadata>;
  }): Promise<BaseEvent> {
    return (await this.appendBatch([event]))[0];
  }
  
  /**
   * Append multiple events atomically.
   * All events succeed or all fail (single transaction).
   * Events must be within the same legal entity for atomicity guarantees.
   */
  async appendBatch(events: Array<Omit<BaseEvent, 'id' | 'sequence' | 'recorded_at' | 'metadata'> & {
    metadata?: Partial<EventMetadata>;
  }>): Promise<BaseEvent[]> {
    if (events.length === 0) return [];
    if (events.length > this.config.maxBatchSize) {
      throw new Error(`Batch size ${events.length} exceeds maximum ${this.config.maxBatchSize}`);
    }
    
    // Validate all events share the same legal entity (for atomic append)
    const legalEntities = new Set(events.map(e => e.scope.legal_entity));
    if (legalEntities.size > 1) {
      throw new Error('All events in a batch must belong to the same legal entity');
    }
    
    // Validate each event against its registered schema
    const validatedEvents: BaseEvent[] = [];
    for (const event of events) {
      validatedEvents.push(await this.validateAndPrepare(event));
    }
    
    // Write to database in a single transaction
    const client = await this.config.database.connect();
    try {
      await client.query('BEGIN');
      
      const results: BaseEvent[] = [];
      for (const event of validatedEvents) {
        const result = await this.insertEvent(client, event);
        results.push(result);
      }
      
      await client.query('COMMIT');
      
      // Emit events for local subscribers (in addition to PostgreSQL NOTIFY)
      for (const event of results) {
        this.emitter.emit('event', event);
        this.emitter.emit(`event:${event.type}`, event);
        this.emitter.emit(`event:entity:${event.scope.legal_entity}`, event);
      }
      
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ════════════════════════════════════════
  // READ — Query events from the store
  // ════════════════════════════════════════
  
  /**
   * Read events from a specific stream.
   */
  async readStream(params: ReadStreamParams): Promise<EventPage> {
    const {
      streamType,
      streamId,
      fromSequence,
      toSequence,
      fromDate,
      toDate,
      eventTypes,
      limit = 100,
      direction = 'forward'
    } = params;
    
    let query = 'SELECT * FROM events WHERE ';
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    // Build stream-specific WHERE clause
    switch (streamType) {
      case 'entity':
        conditions.push(`entity_refs @> $${paramIndex}::jsonb`);
        values.push(JSON.stringify([{ entity_id: streamId }]));
        paramIndex++;
        break;
        
      case 'scope':
        conditions.push(`legal_entity = $${paramIndex}`);
        values.push(streamId);
        paramIndex++;
        break;
        
      case 'type':
        conditions.push(`type = $${paramIndex}`);
        values.push(streamId);
        paramIndex++;
        break;
        
      case 'correlation':
        conditions.push(`correlation_id = $${paramIndex}`);
        values.push(streamId);
        paramIndex++;
        break;
        
      case 'actor':
        conditions.push(`actor_id = $${paramIndex}`);
        values.push(streamId);
        paramIndex++;
        break;
    }
    
    // Optional filters
    if (fromSequence !== undefined) {
      conditions.push(`sequence >= $${paramIndex}`);
      values.push(fromSequence);
      paramIndex++;
    }
    if (toSequence !== undefined) {
      conditions.push(`sequence <= $${paramIndex}`);
      values.push(toSequence);
      paramIndex++;
    }
    if (fromDate) {
      conditions.push(`occurred_at >= $${paramIndex}`);
      values.push(fromDate);
      paramIndex++;
    }
    if (toDate) {
      conditions.push(`occurred_at <= $${paramIndex}`);
      values.push(toDate);
      paramIndex++;
    }
    if (eventTypes && eventTypes.length > 0) {
      conditions.push(`type = ANY($${paramIndex})`);
      values.push(eventTypes);
      paramIndex++;
    }
    
    query += conditions.join(' AND ');
    query += ` ORDER BY sequence ${direction === 'forward' ? 'ASC' : 'DESC'}`;
    query += ` LIMIT $${paramIndex}`;
    values.push(limit + 1); // Fetch one extra to detect hasMore
    
    const result = await this.config.database.query(query, values);
    
    const hasMore = result.rows.length > limit;
    const events = result.rows.slice(0, limit).map(this.rowToEvent);
    
    return {
      events,
      hasMore,
      nextSequence: hasMore ? events[events.length - 1].sequence + 1n : undefined,
    };
  }
  
  /**
   * Get a single event by ID.
   */
  async getById(id: string, legalEntity: string): Promise<BaseEvent | null> {
    const result = await this.config.database.query(
      'SELECT * FROM events WHERE id = $1 AND legal_entity = $2',
      [id, legalEntity]
    );
    return result.rows.length > 0 ? this.rowToEvent(result.rows[0]) : null;
  }
  
  /**
   * Get the full causal chain (lineage) for an event.
   * Returns events from root cause to the specified event.
   */
  async getLineage(eventId: string, legalEntity: string): Promise<BaseEvent[]> {
    // Recursive CTE to walk the caused_by chain
    const result = await this.config.database.query(`
      WITH RECURSIVE lineage AS (
        -- Start with the target event
        SELECT *, 0 as depth FROM events 
        WHERE id = $1 AND legal_entity = $2
        
        UNION ALL
        
        -- Walk up the caused_by chain
        SELECT e.*, l.depth + 1 FROM events e
        INNER JOIN lineage l ON e.id = l.caused_by AND e.legal_entity = l.legal_entity
        WHERE l.depth < 50  -- Safety limit
      )
      SELECT * FROM lineage ORDER BY depth DESC
    `, [eventId, legalEntity]);
    
    return result.rows.map(this.rowToEvent);
  }
  
  /**
   * Get all events caused by a specific event (descendants).
   */
  async getDescendants(eventId: string, legalEntity: string): Promise<BaseEvent[]> {
    const result = await this.config.database.query(`
      WITH RECURSIVE descendants AS (
        SELECT *, 0 as depth FROM events 
        WHERE caused_by = $1 AND legal_entity = $2
        
        UNION ALL
        
        SELECT e.*, d.depth + 1 FROM events e
        INNER JOIN descendants d ON e.caused_by = d.id AND e.legal_entity = d.legal_entity
        WHERE d.depth < 50
      )
      SELECT * FROM descendants ORDER BY occurred_at
    `, [eventId, legalEntity]);
    
    return result.rows.map(this.rowToEvent);
  }
  
  /**
   * Get all events for a specific entity across its lifetime.
   */
  async getEntityHistory(
    entityType: string,
    entityId: string,
    options?: {
      fromDate?: Date;
      toDate?: Date;
      eventTypes?: string[];
      limit?: number;
    }
  ): Promise<EventPage> {
    return this.readStream({
      streamType: 'entity',
      streamId: entityId,
      fromDate: options?.fromDate,
      toDate: options?.toDate,
      eventTypes: options?.eventTypes,
      limit: options?.limit || 100,
    });
  }
  
  /**
   * Get all events sharing a correlation ID (full business process trace).
   */
  async getProcessTrace(correlationId: string): Promise<BaseEvent[]> {
    const result = await this.config.database.query(
      'SELECT * FROM events WHERE correlation_id = $1 ORDER BY occurred_at',
      [correlationId]
    );
    return result.rows.map(this.rowToEvent);
  }
  
  // ════════════════════════════════════════
  // SUBSCRIBE — Real-time event consumption
  // ════════════════════════════════════════
  
  /**
   * Subscribe to events matching a pattern.
   * Returns an unsubscribe function.
   */
  subscribe(
    pattern: SubscriptionPattern,
    handler: (event: BaseEvent) => Promise<void>
  ): () => void {
    const wrappedHandler = async (event: BaseEvent) => {
      if (this.matchesPattern(event, pattern)) {
        try {
          await handler(event);
        } catch (error) {
          // Log error but don't crash the subscription
          console.error(`Subscription handler error for event ${event.id}:`, error);
        }
      }
    };
    
    this.emitter.on('event', wrappedHandler);
    
    return () => {
      this.emitter.off('event', wrappedHandler);
    };
  }
  
  /**
   * Create a persistent subscription that tracks its position.
   * Used by projections and agents to resume after restart.
   */
  async createPersistentSubscription(params: {
    id: string;
    subscriberType: string;
    subscriberId: string;
    eventTypes?: string[];
    legalEntities?: string[];
    scopes?: Record<string, string>;
  }): Promise<PersistentSubscription> {
    await this.config.database.query(`
      INSERT INTO event_subscriptions (id, subscriber_type, subscriber_id, 
                                        event_types, legal_entities, scopes, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = NOW()
    `, [params.id, params.subscriberType, params.subscriberId,
        params.eventTypes || null, params.legalEntities || null,
        params.scopes ? JSON.stringify(params.scopes) : null]);
    
    return new PersistentSubscription(this, params.id);
  }
  
  // ════════════════════════════════════════
  // SNAPSHOT — Point-in-time state capture
  // ════════════════════════════════════════
  
  /**
   * Save a projection snapshot for rebuild optimization.
   */
  async saveSnapshot(params: {
    streamType: string;
    streamId: string;
    projectionId: string;
    lastEventId: string;
    lastEventSeq: bigint;
    state: unknown;
  }): Promise<void> {
    await this.config.database.query(`
      INSERT INTO event_snapshots (id, stream_type, stream_id, snapshot_at,
                                    last_event_id, last_event_seq, projection_id, state)
      VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
    `, [ulid(), params.streamType, params.streamId,
        params.lastEventId, params.lastEventSeq,
        params.projectionId, JSON.stringify(params.state)]);
  }
  
  /**
   * Load the most recent snapshot for a projection.
   */
  async loadSnapshot(
    streamType: string,
    streamId: string,
    projectionId: string
  ): Promise<{state: unknown; lastEventId: string; lastEventSeq: bigint} | null> {
    const result = await this.config.database.query(`
      SELECT state, last_event_id, last_event_seq 
      FROM event_snapshots
      WHERE stream_type = $1 AND stream_id = $2 AND projection_id = $3
      ORDER BY snapshot_at DESC LIMIT 1
    `, [streamType, streamId, projectionId]);
    
    if (result.rows.length === 0) return null;
    
    return {
      state: result.rows[0].state,
      lastEventId: result.rows[0].last_event_id,
      lastEventSeq: BigInt(result.rows[0].last_event_seq),
    };
  }
  
  // ════════════════════════════════════════
  // TYPE REGISTRY — Manage event type schemas
  // ════════════════════════════════════════
  
  /**
   * Register a new event type.
   */
  async registerEventType(registration: EventTypeRegistration): Promise<void> {
    await this.config.database.query(`
      INSERT INTO event_type_registry (type, schema_version, module, data_schema,
        required_dimensions, optional_dimensions, required_entity_refs,
        pii_fields, retention_class, min_retention_years, description, examples,
        registered_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [registration.type, registration.schema_version, registration.module,
        JSON.stringify(registration.data_schema),
        registration.required_dimensions, registration.optional_dimensions,
        JSON.stringify(registration.required_entity_refs),
        JSON.stringify(registration.pii_fields),
        registration.retention_class, registration.minimum_retention_years,
        registration.description, JSON.stringify(registration.examples),
        'system']);
    
    // Cache in memory
    this.typeRegistry.set(
      `${registration.type}:${registration.schema_version}`,
      registration
    );
  }
  
  // ════════════════════════════════════════
  // INTERNAL METHODS
  // ════════════════════════════════════════
  
  private async validateAndPrepare(
    event: Omit<BaseEvent, 'id' | 'sequence' | 'recorded_at' | 'metadata'> & {
      metadata?: Partial<EventMetadata>;
    }
  ): Promise<BaseEvent> {
    // 1. Check event type is registered
    const registration = await this.getEventTypeRegistration(event.type, event.schema_version);
    if (!registration) {
      throw new EventTypeNotRegisteredError(event.type);
    }
    
    // 2. Validate data against JSON Schema
    const violations = this.validateAgainstSchema(event.data, registration.data_schema);
    if (violations.length > 0) {
      throw new EventValidationError(
        `Event data validation failed for type "${event.type}"`,
        event.type,
        violations
      );
    }
    
    // 3. Validate required dimensions
    for (const dim of registration.required_dimensions) {
      if (!event.dimensions[dim]) {
        throw new EventValidationError(
          `Missing required dimension "${dim}" for event type "${event.type}"`,
          event.type,
          [`Missing dimension: ${dim}`]
        );
      }
    }
    
    // 4. Validate required entity references
    for (const req of registration.required_entity_refs) {
      const refs = event.entities.filter(
        e => e.entity_type === req.entity_type && e.role === req.role
      );
      if (refs.length === 0) {
        throw new EventValidationError(
          `Missing required entity reference: ${req.entity_type} (role: ${req.role})`,
          event.type,
          [`Missing entity reference: ${req.entity_type}:${req.role}`]
        );
      }
    }
    
    // 5. Generate ID and compute checksum
    const id = ulid();
    const checksum = this.computeChecksum(id, event);
    
    // 6. Build complete event
    const completeEvent: BaseEvent = {
      ...event,
      id,
      sequence: 0n, // Will be assigned by database
      recorded_at: new Date(),
      metadata: {
        rules_evaluated: event.metadata?.rules_evaluated || [],
        pii_fields: registration.pii_fields.map(p => p.field_path),
        pii_classes: Object.fromEntries(
          registration.pii_fields.map(p => [p.field_path, p.pii_class])
        ),
        checksum,
        previous_checksum: undefined, // Set during insert
        tags: event.metadata?.tags || [],
        source: event.metadata?.source || {
          system: 'nova',
          channel: 'api',
        },
      },
    };
    
    return completeEvent;
  }
  
  private async insertEvent(client: PoolClient, event: BaseEvent): Promise<BaseEvent> {
    const result = await client.query(`
      INSERT INTO events (
        id, type, schema_version,
        occurred_at, effective_date,
        tenant_id, legal_entity, division, region, site, custom_scopes,
        actor_type, actor_id, actor_name, actor_details,
        caused_by, intent_id, correlation_id,
        data, dimensions, entity_refs,
        rules_evaluated, pii_fields, pii_classes, tags,
        source_system, source_channel, source_ref,
        checksum
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27, $28, $29
      )
      RETURNING sequence
    `, [
      event.id, event.type, event.schema_version,
      event.occurred_at, event.effective_date,
      event.scope.tenant_id, event.scope.legal_entity,
      event.scope.division, event.scope.region, event.scope.site,
      JSON.stringify(event.scope.custom_scopes || {}),
      event.actor.type, event.actor.id, event.actor.name,
      JSON.stringify({
        on_behalf_of: event.actor.on_behalf_of,
        session_id: event.actor.session_id,
        trust_level: event.actor.trust_level,
        ip_address: event.actor.ip_address,
      }),
      event.caused_by, event.intent_id, event.correlation_id,
      JSON.stringify(event.data),
      JSON.stringify(event.dimensions),
      JSON.stringify(event.entities),
      JSON.stringify(event.metadata.rules_evaluated),
      event.metadata.pii_fields,
      JSON.stringify(event.metadata.pii_classes),
      event.metadata.tags,
      event.metadata.source.system,
      event.metadata.source.channel,
      event.metadata.source.reference,
      event.metadata.checksum,
    ]);
    
    return {
      ...event,
      sequence: BigInt(result.rows[0].sequence),
    };
  }
  
  private computeChecksum(id: string, event: any): string {
    const payload = JSON.stringify({
      id,
      type: event.type,
      data: event.data,
      scope: event.scope,
      actor: { type: event.actor.type, id: event.actor.id },
    });
    return createHash('sha256').update(payload).digest('hex');
  }
  
  private validateAgainstSchema(data: unknown, schema: any): string[] {
    // Use a JSON Schema validator (e.g., ajv)
    // Returns array of violation messages
    // Implementation depends on chosen validation library
    return []; // Placeholder
  }
  
  private async getEventTypeRegistration(
    type: string, version: number
  ): Promise<EventTypeRegistration | null> {
    const key = `${type}:${version}`;
    
    if (this.typeRegistry.has(key)) {
      return this.typeRegistry.get(key)!;
    }
    
    const result = await this.config.database.query(
      'SELECT * FROM event_type_registry WHERE type = $1 AND schema_version = $2 AND is_active = TRUE',
      [type, version]
    );
    
    if (result.rows.length === 0) return null;
    
    const reg = this.rowToRegistration(result.rows[0]);
    this.typeRegistry.set(key, reg);
    return reg;
  }
  
  private matchesPattern(event: BaseEvent, pattern: SubscriptionPattern): boolean {
    if (pattern.eventTypes && !pattern.eventTypes.includes(event.type)) return false;
    if (pattern.legalEntities && !pattern.legalEntities.includes(event.scope.legal_entity)) return false;
    if (pattern.divisions && event.scope.division && !pattern.divisions.includes(event.scope.division)) return false;
    if (pattern.modules) {
      const module = event.type.split('.')[0];
      if (!pattern.modules.includes(module)) return false;
    }
    return true;
  }
  
  private async setupNotificationListener(): Promise<void> {
    const client = await this.config.database.connect();
    await client.query(`LISTEN ${this.config.notificationChannel}`);
    
    client.on('notification', (msg) => {
      if (msg.channel === this.config.notificationChannel && msg.payload) {
        const eventInfo = JSON.parse(msg.payload);
        // Notify in-process subscribers
        this.emitter.emit('notification', eventInfo);
      }
    });
  }
  
  private rowToEvent(row: any): BaseEvent {
    return {
      id: row.id,
      sequence: BigInt(row.sequence),
      type: row.type,
      schema_version: row.schema_version,
      occurred_at: row.occurred_at,
      recorded_at: row.recorded_at,
      effective_date: row.effective_date,
      scope: {
        tenant_id: row.tenant_id,
        legal_entity: row.legal_entity,
        division: row.division,
        region: row.region,
        site: row.site,
        ...row.custom_scopes,
      },
      actor: {
        type: row.actor_type,
        id: row.actor_id,
        name: row.actor_name,
        ...row.actor_details,
      },
      caused_by: row.caused_by,
      intent_id: row.intent_id,
      correlation_id: row.correlation_id,
      data: row.data,
      dimensions: row.dimensions,
      entities: row.entity_refs,
      metadata: {
        rules_evaluated: row.rules_evaluated,
        pii_fields: row.pii_fields,
        pii_classes: row.pii_classes,
        checksum: row.checksum,
        previous_checksum: row.prev_checksum,
        tags: row.tags,
        source: {
          system: row.source_system,
          channel: row.source_channel,
          reference: row.source_ref,
        },
      },
    };
  }
  
  private rowToRegistration(row: any): EventTypeRegistration {
    return {
      type: row.type,
      schema_version: row.schema_version,
      module: row.module,
      data_schema: row.data_schema,
      required_dimensions: row.required_dimensions,
      optional_dimensions: row.optional_dimensions,
      required_entity_refs: row.required_entity_refs,
      pii_fields: row.pii_fields,
      retention_class: row.retention_class,
      minimum_retention_years: row.min_retention_years,
      description: row.description,
      examples: row.examples,
      previous_versions: row.previous_versions || [],
    };
  }
}


// ──── Supporting Types ────

interface ReadStreamParams {
  streamType: 'entity' | 'scope' | 'type' | 'correlation' | 'actor';
  streamId: string;
  fromSequence?: bigint;
  toSequence?: bigint;
  fromDate?: Date;
  toDate?: Date;
  eventTypes?: string[];
  limit?: number;
  direction?: 'forward' | 'backward';
}

interface EventPage {
  events: BaseEvent[];
  hasMore: boolean;
  nextSequence?: bigint;
}

interface SubscriptionPattern {
  eventTypes?: string[];
  legalEntities?: string[];
  divisions?: string[];
  modules?: string[];
}

// ──── Persistent Subscription ────

class PersistentSubscription {
  constructor(
    private store: EventStoreService,
    private subscriptionId: string
  ) {}
  
  /**
   * Poll for new events since last processed position.
   */
  async poll(limit: number = 100): Promise<BaseEvent[]> {
    // Get current position
    const sub = await this.getSubscription();
    
    // Read events after last processed
    const events = await this.store.readStream({
      streamType: 'scope',
      streamId: 'global',
      fromSequence: sub.lastProcessedSeq ? sub.lastProcessedSeq + 1n : undefined,
      limit,
    });
    
    return events.events;
  }
  
  /**
   * Acknowledge processing of events up to a given ID.
   */
  async acknowledge(eventId: string, sequence: bigint): Promise<void> {
    await this.store['config'].database.query(`
      UPDATE event_subscriptions 
      SET last_processed_id = $1, last_processed_seq = $2, updated_at = NOW()
      WHERE id = $3
    `, [eventId, sequence, this.subscriptionId]);
  }
  
  private async getSubscription(): Promise<{lastProcessedSeq: bigint | null}> {
    const result = await this.store['config'].database.query(
      'SELECT last_processed_seq FROM event_subscriptions WHERE id = $1',
      [this.subscriptionId]
    );
    return {
      lastProcessedSeq: result.rows[0]?.last_processed_seq 
        ? BigInt(result.rows[0].last_processed_seq) 
        : null
    };
  }
}
```

### 4.2 Event Store API (REST)

```typescript
// ════════════════════════════════════════════════════════════════
// EVENT STORE REST API
// ════════════════════════════════════════════════════════════════

// POST /api/events
// Append one or more events
interface AppendEventsRequest {
  events: Array<{
    type: string;
    occurred_at: string;           // ISO 8601
    effective_date: string;        // YYYY-MM-DD
    scope: EventScope;
    actor: EventActor;
    caused_by?: string;
    intent_id?: string;
    correlation_id: string;
    data: Record<string, unknown>;
    dimensions: Record<string, string>;
    entities: EntityReference[];
    tags?: string[];
  }>;
}

interface AppendEventsResponse {
  events: Array<{
    id: string;
    sequence: string;              // BigInt serialized as string
    recorded_at: string;
    checksum: string;
  }>;
}

// GET /api/events/:id?legal_entity=USMF
// Get a single event by ID
interface GetEventResponse {
  event: BaseEvent;
}

// GET /api/events?stream_type=entity&stream_id=V-1042&from_date=2025-01-01&limit=50
// Query events from a stream
interface QueryEventsResponse {
  events: BaseEvent[];
  has_more: boolean;
  next_cursor?: string;            // Opaque cursor for pagination
}

// GET /api/events/:id/lineage?legal_entity=USMF
// Get the full causal chain for an event
interface GetLineageResponse {
  lineage: BaseEvent[];            // Root cause first, target event last
  depth: number;
}

// GET /api/events/:id/descendants?legal_entity=USMF
// Get all events caused by this event
interface GetDescendantsResponse {
  descendants: BaseEvent[];
  count: number;
}

// GET /api/events/process/:correlation_id
// Get all events in a business process
interface GetProcessTraceResponse {
  correlation_id: string;
  events: BaseEvent[];
  process_duration_ms: number;
  actors_involved: string[];
  entities_involved: EntityReference[];
}

// POST /api/event-types
// Register a new event type
interface RegisterEventTypeRequest {
  type: string;
  schema_version: number;
  module: string;
  data_schema: object;             // JSON Schema
  required_dimensions: string[];
  optional_dimensions: string[];
  required_entity_refs: object[];
  pii_fields: object[];
  retention_class: string;
  minimum_retention_years?: number;
  description: string;
  examples?: object[];
}

// GET /api/event-types
// List all registered event types
interface ListEventTypesResponse {
  event_types: EventTypeRegistration[];
  total: number;
}

// POST /api/subscriptions
// Create a persistent subscription
interface CreateSubscriptionRequest {
  id: string;
  subscriber_type: string;
  subscriber_id: string;
  event_types?: string[];
  legal_entities?: string[];
  scopes?: Record<string, string>;
}

// GET /api/subscriptions/:id/poll?limit=100
// Poll for new events on a persistent subscription
interface PollSubscriptionResponse {
  events: BaseEvent[];
  has_more: boolean;
}

// POST /api/subscriptions/:id/acknowledge
// Acknowledge processing of events
interface AcknowledgeRequest {
  event_id: string;
  sequence: string;
}
```

---

## 5. Event Schema Evolution

Events are immutable, but event type schemas evolve over time. The system handles this through versioned schemas and migration functions.

### 5.1 Schema Versioning Strategy

```typescript
// When a schema changes, a new version is registered.
// Old events retain their original schema_version.
// Consumers must handle all active versions.

interface SchemaEvolution {
  // Adding optional fields: SAFE, same version
  // Adding required fields: NEW VERSION required
  // Removing fields: NEW VERSION (old fields preserved in existing events)
  // Renaming fields: NEW VERSION with migration
  // Changing field types: NEW VERSION with migration
  
  migrations: {
    from_version: number;
    to_version: number;
    // Function that transforms old event data to new format
    // Used when projections read old events
    transform: (oldData: Record<string, unknown>) => Record<string, unknown>;
  }[];
}

// Example: AP Invoice schema evolution
const invoiceSchemaEvolution: SchemaEvolution = {
  migrations: [
    {
      from_version: 1,
      to_version: 2,
      // V2 adds "payment_method" field
      transform: (data) => ({
        ...data,
        payment_method: data.payment_method || 'check', // default for old events
      }),
    },
    {
      from_version: 2,
      to_version: 3,
      // V3 renames "po_reference" to "purchase_order_ref" and adds structure
      transform: (data) => ({
        ...data,
        purchase_order_ref: data.po_reference 
          ? { id: data.po_reference, type: 'single' } 
          : null,
      }),
    },
  ],
};
```

### 5.2 Consumer Compatibility

```typescript
// Projection handlers should handle multiple schema versions
interface ProjectionEventHandler<TState> {
  // Map of schema version → handler
  handlers: {
    [version: number]: (state: TState, event: BaseEvent) => TState;
  };
  
  // Or use the migration system to normalize to latest version first
  normalizeToLatest: boolean;
}

// Example:
const apSubledgerHandler: ProjectionEventHandler<APState> = {
  normalizeToLatest: true, // Always migrate to latest schema before processing
  handlers: {
    // Only need handler for latest version since normalizeToLatest = true
    3: (state, event) => {
      // Process with V3 schema guaranteed
      return updateAPState(state, event.data);
    },
  },
};
```

---

## 6. Performance Considerations

### 6.1 Write Path Optimization

```yaml
write_optimization:
  batching:
    - group related events into single transaction
    - max batch size: 100 events (configurable)
    
  partitioning:
    - legal_entity as partition key
    - each partition is independent (no cross-partition locks)
    - new partitions created automatically on legal entity creation
    
  indexing:
    - indexes are partition-local (faster inserts)
    - GIN indexes for JSONB are maintained asynchronously
    
  checksum_chain:
    - optional: can be disabled for high-throughput scenarios
    - enabled by default for regulatory-grade audit
    
  expected_throughput:
    - single partition: ~5,000 events/second
    - multi-partition (parallel): ~5,000 × N events/second
    - with batching: up to 50,000 events/second aggregate
```

### 6.2 Read Path Optimization

```yaml
read_optimization:
  index_strategy:
    - most queries hit the legal_entity partition first (fast)
    - type + occurred_at index covers most analytical queries
    - entity_refs GIN index for entity-centric queries
    - correlation_id index for process tracing
    
  snapshot_strategy:
    - projections snapshot every N events (configurable)
    - rebuild from snapshot + remaining events (not from beginning)
    - snapshot interval: 1,000-10,000 events depending on projection complexity
    
  caching:
    - event type registry: in-memory (refreshed on change)
    - recent events: Redis cache for hot-path access
    - lineage results: cached for frequently accessed events
    
  archival:
    - events older than online retention moved to compressed storage
    - archive queries route to archive store transparently
    - metadata-only queries against archive are fast
    - full event retrieval from archive: seconds latency
```

### 6.3 Partition Management

```typescript
// Automatic partition management
class PartitionManager {
  /**
   * Create a new partition when a legal entity is added.
   */
  async createPartition(legalEntity: string): Promise<void> {
    const partitionName = `events_${legalEntity.toLowerCase()}`;
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ${partitionName} 
      PARTITION OF events FOR VALUES IN ('${legalEntity}')
    `);
    
    // Partition-local indexes are created automatically via parent table index definitions
  }
  
  /**
   * Archive old events from a partition.
   */
  async archiveOldEvents(
    legalEntity: string, 
    olderThan: Date
  ): Promise<{archived: number}> {
    // Copy to archive table
    const result = await this.db.query(`
      WITH moved AS (
        DELETE FROM events
        WHERE legal_entity = $1 AND occurred_at < $2
        RETURNING *
      )
      INSERT INTO events_archive SELECT * FROM moved
    `, [legalEntity, olderThan]);
    
    return { archived: result.rowCount || 0 };
  }
}
```

---

## 7. Error Handling & Edge Cases

### 7.1 Error Scenarios

```typescript
// Error handling matrix
const errorHandling = {
  // Schema validation failure
  schema_validation: {
    response: 'reject event with detailed validation errors',
    retry: 'no — fix the data and resubmit',
    impact: 'event not written',
  },
  
  // Unregistered event type
  unknown_event_type: {
    response: 'reject with EventTypeNotRegisteredError',
    retry: 'register the event type first, then resubmit',
    impact: 'event not written',
  },
  
  // Database write failure
  db_write_failure: {
    response: 'transaction rolled back, error returned to caller',
    retry: 'yes — safe to retry (ULID regenerated)',
    impact: 'no partial writes (atomic transaction)',
  },
  
  // Duplicate event ID
  duplicate_id: {
    response: 'unique constraint violation → retry with new ULID',
    retry: 'automatic (generate new ULID)',
    impact: 'negligible — ULID collisions are astronomically rare',
  },
  
  // Partition not found
  partition_missing: {
    response: 'auto-create partition for the legal entity',
    retry: 'automatic',
    impact: 'first event for new entity has slight latency',
  },
  
  // Subscription handler failure
  subscription_error: {
    response: 'log error, increment error count on subscription',
    retry: 'event remains unacknowledged, will be re-polled',
    impact: 'other subscriptions unaffected',
    circuit_breaker: 'disable subscription after N consecutive failures',
  },
  
  // Notification channel failure
  notification_failure: {
    response: 'events still written successfully',
    retry: 'subscribers catch up via polling',
    impact: 'slight delay in real-time propagation',
  },
};
```

### 7.2 Idempotency

```typescript
// For external systems that might retry, support idempotency keys
interface IdempotentAppend {
  idempotency_key: string;       // Client-provided key
  event: AppendEventRequest;
}

// The system checks if an event with this idempotency key already exists
// If yes: return the existing event (no duplicate write)
// If no: proceed with normal append

// Implementation: separate idempotency_keys table with TTL
// CREATE TABLE idempotency_keys (
//   key TEXT PRIMARY KEY,
//   event_id TEXT NOT NULL,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//   expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
// );
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
describe('EventStore', () => {
  describe('append', () => {
    it('should assign ULID and record timestamp', async () => {});
    it('should validate against registered schema', async () => {});
    it('should reject events with missing required dimensions', async () => {});
    it('should reject events with missing required entity refs', async () => {});
    it('should compute checksum correctly', async () => {});
    it('should reject unregistered event types', async () => {});
    it('should enforce batch within single legal entity', async () => {});
  });
  
  describe('readStream', () => {
    it('should read events by entity reference', async () => {});
    it('should read events by correlation ID', async () => {});
    it('should paginate correctly', async () => {});
    it('should filter by date range', async () => {});
    it('should filter by event type', async () => {});
    it('should read forward and backward', async () => {});
  });
  
  describe('lineage', () => {
    it('should trace full causal chain', async () => {});
    it('should handle events with no parent', async () => {});
    it('should limit depth to prevent infinite loops', async () => {});
  });
  
  describe('immutability', () => {
    it('should prevent UPDATE on events', async () => {});
    it('should prevent DELETE on events', async () => {});
    it('should allow PII redaction through special function (fallback)', async () => {});
  });
  
  describe('idempotency', () => {
    it('should reject duplicate idempotency_key with reference to original', async () => {});
    it('should reject natural business key duplicate (e.g., same vendor+invoice_number)', async () => {});
    it('should allow same business key after dedupe window expires', async () => {});
  });
  
  describe('concurrency', () => {
    it('should append when expected_entity_version matches actual', async () => {});
    it('should throw ConcurrencyConflictError on version mismatch', async () => {});
    it('should handle concurrent appends to different entities in same partition', async () => {});
  });
  
  describe('crypto-shredding', () => {
    it('should encrypt PII fields before INSERT (verify ciphertext in DB)', async () => {});
    it('should decrypt PII fields on read when key is active', async () => {});
    it('should return [REDACTED] when key has been destroyed', async () => {});
    it('should preserve non-PII fields after key destruction', async () => {});
    it('should track event-to-subject PII mappings', async () => {});
  });
  
  describe('subscriptions', () => {
    it('should deliver events matching pattern', async () => {});
    it('should not deliver events not matching pattern', async () => {});
    it('should track persistent subscription position', async () => {});
    it('should resume from last acknowledged position', async () => {});
  });
  
  describe('performance', () => {
    it('should append 1000 events in under 1 second', async () => {});
    it('should read 1000 events in under 500ms', async () => {});
    it('should handle concurrent appends to different partitions', async () => {});
  });
});
```

### 8.2 Integration Tests

```typescript
describe('EventStore Integration', () => {
  it('should create partition on new legal entity', async () => {});
  it('should trigger PostgreSQL NOTIFY with minimal payload only', async () => {});
  it('should maintain sequence ordering within partition', async () => {});
  it('should archive old events without data loss (snapshot-before-archive)', async () => {});
  it('should redact PII fields via fallback and record redaction', async () => {});
  it('should handle schema migration for old events (upcasting on read)', async () => {});
  it('should encrypt PII synchronously — verify no plaintext in raw table pages', async () => {});
  it('should deliver events at-least-once via cursor-based polling', async () => {});
  it('should resume subscription from last cursor after subscriber restart', async () => {});
  it('should detect and reject concurrent entity modification (optimistic concurrency)', async () => {});
  it('should create entity snapshot when stream exceeds threshold', async () => {});
  it('should invalidate entity snapshot on back-dated event', async () => {});
});
```

---

## 9. Acceptance Criteria

The Event Store is considered complete when:

- [ ] Events can be appended with validation against registered schemas
- [ ] Events are immutable (UPDATE/DELETE blocked at database level)
- [ ] Events are partitioned by legal entity with automatic partition creation
- [ ] All stream query types work (entity, scope, type, correlation, actor)
- [ ] Event lineage traversal works (ancestors and descendants)
- [ ] Real-time subscriptions deliver events within 100ms
- [ ] Persistent subscriptions track position and resume correctly
- [ ] Snapshots can be saved and loaded for projection optimization
- [ ] PII fields encrypted via crypto-shredding before INSERT (plaintext never hits WAL)
- [ ] Key destruction renders PII permanently unreadable, event skeleton preserved
- [ ] Fallback PII redaction works for pre-crypto-shredding events
- [ ] Schema evolution with version migration (upcasting on read) is functional
- [ ] Checksum chain provides tamper detection
- [ ] Idempotency: duplicate idempotency_key returns original result, not double-write
- [ ] Idempotency: natural business key dedupe rejects logical duplicate events
- [ ] Concurrency: optimistic version check detects conflicting entity mutations
- [ ] Concurrency: ConcurrencyConflictError thrown with clear diagnostic on version mismatch
- [ ] NOTIFY payload is minimal signal only ({partition, sequence}), never event data
- [ ] Delivery model: cursor-based polling with NOTIFY wakeup delivers at-least-once
- [ ] Performance: 2,000+ events/second per partition append throughput (Phase 0 gate target)
- [ ] Performance: sub-100ms for single event retrieval by ID
- [ ] REST API covers all operations
- [ ] Error handling is comprehensive with clear error types

---

## 10. Dependencies & Integration Points

### 10.1 What This Component Provides To Others

| Consumer | What It Uses |
|----------|-------------|
| **Entity Graph** | Appends entity lifecycle events; queries entity streams |
| **Rules Engine** | Subscribes to events for rule evaluation; reads event context |
| **Projection Engine** | Subscribes to events for projection updates; reads streams for rebuild |
| **Intent Protocol** | Appends events as intent resolution output; reads for lineage |
| **Audit Engine** | Reads full event streams; queries by actor, entity, correlation |
| **All Business Modules** | Append domain events; query domain event streams |

### 10.2 What This Component Requires

| Dependency | What It Needs |
|-----------|--------------|
| **PostgreSQL** | Database with partitioning support (v12+) |
| **ULID Library** | Time-sortable unique ID generation |
| **JSON Schema Validator** | Event data validation (e.g., ajv) |
| **Crypto** | SHA-256 for checksums; AES-256-GCM for PII encryption |
| **KMS / Key Management** | Envelope encryption for crypto-shredding (KEK storage, DEK wrapping/unwrapping) |

---

## 11. Review Addendum (February 2026)

The following sections formalize design decisions and implementation requirements identified during three independent architecture reviews. They supplement Sections 1-10 above and take precedence where they conflict with earlier content. See `reference/REVIEW_SYNTHESIS.md` and `reference/ADR_LOG.md` for full context.

### 11.1 Authoritative Timestamp Semantics

Three timestamps serve distinct purposes. Confusing them causes real accounting errors in ERP systems.

**`occurred_at`** (DateTime with timezone): When the real-world event happened, as reported by the client or source system. Drives display ordering in activity logs and human-facing timelines. Trust level: **low** (user-provided, may be inaccurate or timezone-shifted). Set by client. Immutable once recorded.

**`recorded_at`** (DateTime UTC + monotonic sequence number): When the event store accepted the event. Drives event ordering within partition (authoritative), subscription delivery order, concurrency control, and replay sequence. Trust level: **high** (system-generated, monotonic within partition). Set by event store server. Immutable. Guarantee: monotonically increasing within partition.

**`effective_date`** (Date, no time component): Business date for accounting and reporting. Drives fiscal period assignment, financial projection grouping, period-close logic, and regulatory reporting. Trust level: **medium** (user-provided but validated by rules engine against open period constraints). Set by client with validation. Immutable.

**Ordering rules:**
- Within partition: `recorded_at` sequence number is authoritative
- Cross partition: no global ordering guaranteed (eventual consistency)
- For projections: process events by `recorded_at` order; bucket results by `effective_date`
- For display: show `occurred_at` unless user requests system ordering

**Late-arriving events** (event arrives today with `effective_date` in a prior period):
- Period open: process normally, projections update prior period
- Period soft-closed: route to approval workflow (controller/CFO approves back-date)
- Period hard-closed: reject; user must post adjusting entry to current period

### 11.2 Event Delivery Model

The events table IS the outbox. LISTEN/NOTIFY is a wakeup optimization, not a delivery guarantee. Subscribers pull from their cursor position for durable, at-least-once delivery.

**Flow:**
1. Event appended to events table (single atomic transaction)
2. NOTIFY fired with minimal payload `{partition, sequence}` (best effort — may fail)
3. Subscriber receives NOTIFY → immediately polls from last acknowledged cursor position
4. If NOTIFY missed → subscriber polls on interval (fallback, configurable, default 500ms)
5. Subscriber processes event → acknowledges by advancing cursor position
6. Cursor position stored in `event_subscriptions` table (durable)

**Guarantees:**
- Delivery: at-least-once (cursor advances only after successful processing)
- Ordering: strict within partition (by `recorded_at` sequence number)
- Deduplication: subscriber responsibility (idempotent handlers required)
- Replay: subscriber can reset cursor to any past position

**Configuration defaults:**
- `poll_interval_fallback`: 500ms
- `batch_size`: 100 events per poll cycle
- `max_processing_time`: 30s per event before timeout
- `dead_letter_threshold`: 5 consecutive failures before dead-lettering

**Scale-up triggers** (when to consider Redis Streams or NATS JetStream):
- Subscriber count > 50 concurrent connections
- Notification latency p99 > 200ms consistently
- Need topic-based routing beyond "new event in partition"

Events table remains source of truth regardless of transport layer.

### 11.3 Optimistic Concurrency Control

When an intent modifies an entity, it reads the entity's current version, processes through the pipeline, and includes `expected_entity_version` when appending the resulting event. The event store checks that the entity's version hasn't advanced since the read.

**Mechanism:**
1. Intent reads entity with `current_version` from entity graph
2. Intent processes through pipeline (validate, plan, approve, execute)
3. On event append: include `expected_entity_version` in the event
4. Append function checks: actual entity version == expected version
5. Match: append succeeds, entity version incremented atomically
6. Mismatch: `ConcurrencyConflictError` raised
7. Intent protocol retries from validation step with fresh state

**Retry policy:** max 3 retries, exponential backoff (50ms, 200ms, 800ms). On exhaustion: fail intent with conflict explanation.

**Scope:** per `(entity_type, entity_id)` within a legal entity partition.

**Known limitation (MVP):** Entity-level OCC means non-overlapping field changes to the same entity trigger unnecessary conflicts. For MVP this is acceptable. Field-level or JSON-patch OCC may be needed in Phase 2/3 for human-agent collaboration scenarios. See ADR-009.

### 11.4 Archival Invariants

These hold for the lifetime of the system, regardless of archival strategy:

1. **Current state always online.** Current state of any entity is computable from online storage (snapshot + recent events). Cold storage retrieval is NEVER required for current-state operations.

2. **Full history always possible.** Full history replay of any entity is always achievable, though it may require cold storage retrieval (minutes to hours latency).

3. **Archived events remain replayable.** Schema versions, upcasting functions, and encryption keys (if PII not deleted) are preserved alongside archived events.

4. **Event metadata never archived.** `event_id`, `stream_id`, `sequence`, `recorded_at`, `event_type`, and `correlation_id` remain in the primary store permanently for index and reference purposes. Only the event payload (`data`) is moved to cold storage.

**Snapshot-before-archive rule:** Events cannot be archived unless all dependent projections AND strong-read entity snapshots have valid snapshots covering the archived range. See `reference/REVIEW_SYNTHESIS.md` Section 2.9.

**Target latencies:**
- Current state: < 50ms (always from online storage)
- Recent history (last 2 years default): < 100ms
- Full history: < 1 hour (cold storage retrieval + replay)
- Audit investigation: < 4 hours (complex multi-entity historical query)

### 11.5 Strong-Read Entity Snapshots

Separate from projection snapshots, entity snapshots support the "strong" consistency level by checkpointing an entity's state derived from its event stream.

```sql
-- Entity-level snapshots for strong-read consistency
-- These are separate from projection snapshots (which checkpoint projection state)
CREATE TABLE entity_snapshots (
    entity_type     TEXT        NOT NULL,
    entity_id       TEXT        NOT NULL,
    legal_entity    TEXT        NOT NULL,
    
    -- Snapshot content
    state           JSONB       NOT NULL,   -- Full entity state at this point
    version         BIGINT      NOT NULL,   -- Entity version at snapshot
    as_of_sequence  BIGINT      NOT NULL,   -- Event store sequence at snapshot
    
    -- Lifecycle
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          TEXT        NOT NULL DEFAULT 'valid',  -- 'valid' | 'stale'
    
    PRIMARY KEY (legal_entity, entity_type, entity_id)
);
```

**Trigger for snapshot creation:** entity stream length exceeds 100 events since last snapshot.

**On strong read:** load entity snapshot + fold events after snapshot's `as_of_sequence`. Typical fold: 0-100 events, well under 1ms.

**Fold timeout:** 500ms. If a strong read takes longer (extremely long stream, missing snapshot), degrade to "verified" consistency and log a warning for operations review.

**Invalidation on back-dated event:** if `event.effective_date < snapshot.as_of_point`, mark snapshot status as `'stale'`. Next strong read rebuilds from the prior valid snapshot (or from stream start if no prior snapshot).

### 11.6 Schema Evolution Policy

Supplements Section 5 (Event Schema Evolution) with explicit decision framework:

| Change Type | Action | Version Bump | Migration |
|------------|--------|-------------|-----------|
| Add optional field | Add to schema | No | None — tolerant readers ignore unknown fields |
| Add required field | Add with default | Yes (v1 → v2) | Upcaster provides default when hydrating v1 events |
| Rename/restructure field | Transform on read | Yes | Upcaster middleware transforms during projection rebuild |
| Change field semantics | New event type | N/A | Old type deprecated, never modified or deleted |
| Breaking change | New event type | N/A | Clean separation; old events remain as-is |

**PROHIBITED:**
- Copy-and-transform migration (NEVER rewrite historical events)
- In-place update (NEVER modify existing events)
- Delete old versions (NEVER remove old event type definitions)

See ADR-011 for full rationale.

---

*End of Review Addendum. For complete review context, see `reference/REVIEW_SYNTHESIS.md`, `reference/ADR_LOG.md`, and `reference/NFR.md`.*
