# Project Nova — Build Plan

**Version:** 2.0  
**Date:** February 2026  
**Approach:** Walking skeleton first, then deepen. Vertical slice validates integration before breadth.  
**Revision note:** Restructured from sequential component development (v1.0) to vertical-slice-first approach based on architecture review feedback. See ADR-016.

---

## Build Philosophy

**Week 2 principle:** By end of Week 2, one intent flows through the complete pipeline — intent → rules → events → projection → query → audit trace. This validates the entire architectural spine before any component is built to depth.

**Phase gate principle:** No phase begins until the previous phase passes its exit gate. Exit gates are automated tests with concrete, measurable pass criteria.

**Wedge capability:** AP Invoice Lifecycle is the first business scenario. It stress-tests approvals, segregation of duties, PII handling, matching logic, GL posting, and audit — touching nearly every architectural component.

---

## Phase 0: Foundation Engine

**Duration:** 6 weeks  
**Goal:** Working engine with one business scenario validated by stress tests  
**Exit gate:** Phase 0 stress test criteria (Section 0.4)

---

### Phase 0.1: Walking Skeleton (Weeks 1-2)

**Goal:** One intent flows through the complete pipeline. Every engine component exists at minimum viable depth.

#### Week 1: Core Pipeline

**Event Store — Minimum:**
- `events` table: `event_id`, `stream_id`, `sequence`, `event_type`, `version`, `data` (JSONB), `metadata` (JSONB), `recorded_at`, `partition_key`
- Append function with sequence number generation (monotonic within stream)
- Read by stream_id (ordered by sequence)
- Read by partition (ordered by recorded_at)
- Idempotency check (idempotency_key column with unique index)
- Single partition (no multi-legal-entity partitioning yet)

**Entity Graph — Minimum:**
- `entities` table: `entity_id`, `entity_type`, `attributes` (JSONB), `version`, `created_at`, `updated_at`
- `entity_relationships` table: `source_id`, `target_id`, `relationship_type`, `attributes` (JSONB)
- Create entity, read entity, update entity (version check)
- Single-hop relationship lookup

**Rules Engine — Minimum:**
- Rule definition: `{ conditions: [...], actions: [...], priority: number }`
- Condition evaluator: field comparisons against event/entity context (`field == value`, `field > value`, `field in [...]`)
- Action types: `approve`, `reject`, `flag`
- Evaluation trace: which rules fired, which conditions matched, what action was taken
- One hardcoded rule set (no dynamic loading yet)

**Projection Engine — Minimum:**
- `subscriptions` table: `subscription_id`, `projection_type`, `last_sequence`, `status`
- Projection worker: poll events from last sequence, apply handler, update projection table, advance cursor
- LISTEN/NOTIFY wakeup (with polling fallback)
- One projection type: simple entity list (e.g., vendor list)

**Intent Protocol — Minimum:**
- Intent structure: `{ intent_type, actor, data, idempotency_key }`
- Pipeline stages: receive → validate (rules) → execute (append event)
- No authentication/authorization yet (added in Phase 0.2)
- No approval workflow yet (added in Phase 0.2)
- REST endpoint: `POST /intents`

#### Week 1 Deliverable
```
POST /intents { type: "mdm.vendor.create", data: { name: "Contoso Supply", ... } }
  → Rules engine validates (name not empty, no duplicate)
  → Event appended: "mdm.vendor.created"
  → Projection updated: vendor_list includes Contoso
  → GET /projections/vendor_list returns Contoso
  → GET /audit/events/{event_id} returns full trace
```

#### Week 2: Integration Hardening

- **Concurrency control:** Add `expected_entity_version` to event append. Test concurrent modifications of same entity.
- **Idempotency test:** Submit same intent twice with same idempotency_key. Verify second returns original result.
- **Error handling:** Invalid intent → meaningful error response with rule evaluation trace.
- **Second entity type:** Add a simple item/product entity to verify entity graph generality.
- **Second projection type:** Add item list projection to verify projection engine generality.
- **Timestamp semantics:** Implement `occurred_at` (client-provided), `recorded_at` (server-generated), `effective_date` (business date). Verify ordering uses `recorded_at`.
- **Basic REST API:** CRUD-equivalent endpoints for entities and projections (all mutations through intent protocol).

#### Week 2 Deliverable
```
Complete walking skeleton:
  - 2 entity types (vendor, item) created through intent protocol
  - 2 projections maintained from events
  - Concurrent intent test passing
  - Idempotency test passing
  - Full audit trace for every operation
  - REST API for all operations
```

---

### Phase 0.2: Engine Depth (Weeks 3-4)

**Goal:** Add security, approvals, subscriptions, and rules sophistication needed for business scenarios.

#### Week 3: Security & Approvals

**Authentication & Authorization:**
- JWT token validation on intent submission
- Actor identity extracted from token and attached to intent
- Capability-based authorization: actor has capabilities, intent requires capabilities
- Reject unauthorized intents with clear error

**Approval Workflow:**
- Intent pipeline gains `plan → approve → execute` stages
- Approval routing: rules can specify `route_for_approval(approver_role)`
- Approval REST endpoint: `POST /intents/{id}/approve` and `POST /intents/{id}/reject`
- Intent state machine: `submitted → validated → pending_approval → approved → executed` (or `rejected`)

**Entity Relationships:**
- Create relationships between entities (vendor → address, vendor → contact, vendor → bank_account)
- Relationship traversal: given vendor, return all contacts
- Relationship constraints: cardinality (one-to-many, many-to-many), required relationships

**Scope Foundation:**
- Add `scope` field to events and entities: `{ legal_entity: string }`
- Event store partitioning by `scope.legal_entity`
- Projection partitioning by `scope.legal_entity`
- Basic scope enforcement: intents can only affect entities within actor's scope

**RLS Foundation (proves the pattern):**
- RLS policy on vendor_list projection: users scoped to legal entity A cannot query legal entity B
- Automated RLS enforcement test in CI pipeline
- This validates the RLS pattern before Phase 1 applies it to all projections

**NFR Phase 0 Mechanisms (prove they exist, don't harden yet):**
- Structured JSON logging with correlation_id across full intent pipeline
- One OpenTelemetry trace through intent → rules → event → projection → query
- Basic /health endpoint for each service component

#### Week 4: Rules & Projections Depth

**Rules Engine Depth:**
- Dynamic rule loading from configuration (YAML/JSON rule definitions)
- Rule versioning: effective_from / effective_to dates
- Rule priority and conflict resolution (lower number wins)
- Evaluation phases: validate → enrich → decide (no cross-phase action violations)
- Cycle detection: max depth per correlation_id
- Condition operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `in`, `not_in`, `exists`, `matches`
- Context access: event data, entity attributes, projection values

**Projection Engine Depth:**
- Projection rebuild from event replay (reset cursor to zero, reprocess all events)
- Snapshot creation and restoration
- Snapshot invalidation on back-dated events (mark stale, rebuild on next read for lazy; immediate rebuild for eager)
- Multiple projection handlers per event type (one event can update multiple projections)
- Batch processing for rebuild (configurable batch size)
- Error handling: dead-letter events that fail projection processing

**Event Store Depth:**
- Event versioning: `schema_version` field, event type registry
- Subscription management: create, pause, resume, reset subscriptions
- Multi-partition support: events partitioned by legal_entity
- Event metadata: `correlation_id`, `causation_id`, `actor_id`, `intent_id`

#### Week 4 Deliverable
```
Full engine with:
  - Authenticated, authorized intent submission
  - Approval workflow (submit → approve → execute)
  - Dynamic rules with versioning and tracing
  - Projection rebuild and snapshot support
  - Multi-entity scope enforcement
  - Event lineage (correlation_id, causation_id)
```

---

### Phase 0.3: First Business Scenario — AP Invoice (Weeks 5-6)

**Goal:** End-to-end AP invoice lifecycle proving the engine supports real business complexity. Simultaneously run stress tests to validate engine at scale.

#### Week 5: AP Invoice Lifecycle

**Events:**
```yaml
ap_events:
  - ap.invoice.submitted       # vendor invoice received, awaiting match
  - ap.invoice.matched         # 3-way match (PO, receipt, invoice) completed
  - ap.invoice.match_exception # match failed (price variance, quantity variance)
  - ap.invoice.approved        # approved for payment
  - ap.invoice.rejected        # rejected (returns to vendor or dispute)
  - ap.invoice.posted          # GL impact recorded
  - ap.invoice.paid            # payment executed
  - ap.invoice.cancelled       # invoice cancelled (compensating event)
```

**Entities:**
```yaml
ap_entities:
  vendor:
    attributes: [name, tax_id, payment_terms, currency, status]
    relationships: [addresses, contacts, bank_accounts, invoices]
  invoice:
    attributes: [invoice_number, vendor_id, amount, currency, due_date, status, lines[]]
    relationships: [vendor, purchase_order, goods_receipt, payment]
  purchase_order:
    attributes: [po_number, vendor_id, total, status, lines[]]
    relationships: [vendor, requisition, invoices, receipts]
```

**Rules:**
```yaml
ap_rules:
  duplicate_check:
    condition: "ap.invoice.submitted AND exists(invoice where vendor_id == event.vendor_id AND invoice_number == event.invoice_number)"
    action: reject("Duplicate invoice")
    
  three_way_match:
    condition: "ap.invoice.submitted AND po_exists AND receipt_exists"
    action: |
      if abs(invoice.amount - po.amount) <= tolerance:
        emit(ap.invoice.matched)
      else:
        emit(ap.invoice.match_exception, { variance: delta })
        
  approval_routing:
    condition: "ap.invoice.matched AND invoice.amount > 10000"
    action: route_for_approval(role: "ap_manager")
    
  approval_routing_low:
    condition: "ap.invoice.matched AND invoice.amount <= 10000"
    action: auto_approve()
    
  sod_enforcement:
    condition: "ap.invoice.approve AND intent.actor == invoice.submitted_by"
    action: reject("Segregation of duties violation: submitter cannot approve")
```

**Projections:**
```yaml
ap_projections:
  ap_invoice_list:
    description: "All invoices with current status, filterable by vendor/status/date"
    partition_key: [legal_entity]
    rls: [department]
    
  ap_aging:
    description: "Invoices aged by due date (current, 30, 60, 90, 120+ days)"
    partition_key: [legal_entity]
    aggregation: sum(amount) grouped by aging_bucket
    
  ap_vendor_balance:
    description: "Outstanding balance per vendor"
    partition_key: [legal_entity, vendor_id]
    
  gl_postings:
    description: "Journal entries generated from AP events"
    partition_key: [legal_entity, account_code]
    note: "AP invoice posting creates debit to expense/asset, credit to AP control"
```

**Full Scenario Test:**
```
1. Create vendor (through intent protocol, with approval)
2. Create purchase order for vendor
3. Submit vendor invoice
4. System runs 3-way match (automated rule)
5. Match succeeds → invoice auto-matched
6. Invoice above threshold → routed for approval
7. AP Manager approves (SoD enforced: different user from submitter)
8. Invoice posted → GL impact projected
9. Invoice paid → payment event recorded
10. Verify: AP aging reflects correctly, vendor balance updated, GL balances correct
11. Back-date an invoice → verify snapshot invalidation and projection update
12. Submit duplicate invoice → verify rejection with trace
13. Attempt SoD violation → verify rejection with trace
```

#### Week 6: Stress Tests & Phase Gate

**Stress Test Suite:**

```yaml
stress_tests:
  throughput_test:
    description: "Sustained event append throughput"
    method: generate 100K synthetic AP events across 5 legal entities
    target: "> 2,000 events/second per partition"
    duration: 5 minutes sustained
    
  concurrent_intent_test:
    description: "Concurrent intents against same entities"
    method: 50 concurrent intent submissions modifying same vendor/invoice entities
    target: "zero lost updates, all concurrency conflicts detected and retried"
    verification: final state = sum of all successful modifications
    
  projection_lag_test:
    description: "Projection update latency under load"
    method: measure time from event append to projection reflecting event
    target: "< 1 second p99 under sustained 2,000 events/second"
    
  projection_rebuild_test:
    description: "Full projection rebuild from event replay"
    method: rebuild ap_aging projection from 1M events
    target: "< 10 minutes"
    verification: rebuilt projection matches incrementally-maintained projection exactly
    
  idempotency_test:
    description: "Duplicate intent handling"
    method: submit 10K intents, each sent twice with same idempotency_key
    target: "exactly 10K events created, 10K duplicate responses returned"
    
  back_dated_event_test:
    description: "Back-dated posting and snapshot invalidation"
    method: create snapshots, post back-dated invoice to prior period, verify rebuild
    target: "affected snapshots invalidated, projections corrected within 5 seconds"
    
  schema_migration_test:
    description: "Event version change with projection rebuild"
    method: introduce V2 of ap.invoice.submitted with new field, rebuild projections
    target: "all V1 events upcasted correctly, projection reflects both V1 and V2 data"
    
  reconciliation_test:
    description: "Financial consistency check"
    method: after all tests, verify trial balance = sum of all posted GL events
    target: "zero variance (exact reconciliation)"
```

**Phase 0 Exit Gate:**
All stress tests must pass at minimum tier. Automated test suite produces a gate report:

```
PHASE 0 EXIT GATE REPORT
========================

TIER: PASS-MINIMUM (architecture scales linearly, no pathological behavior)
  Linear scaling:      PASS (throughput scales with partition count)
  No unbounded lag:    PASS (projection lag stable under sustained load)
  No lock contention:  PASS (no escalating lock waits)
  No memory leaks:     PASS (stable memory under 1-hour load test)

TIER: PASS-TARGET (meets stated NFR targets)
  Throughput:          PASS (2,847 events/sec per partition)
  Concurrent intents:  PASS (0 lost updates in 50 concurrent sessions)
  Projection lag p99:  PASS (743ms under sustained load)
  Projection rebuild:  PASS (1M events in 7m 23s)
  Idempotency:         PASS (10,000/10,000 duplicates detected)
  Back-dated events:   PASS (snapshots invalidated, projections corrected in 3.2s)
  Schema migration:    PASS (V1→V2 upcasting verified)
  Reconciliation:      PASS ($0.00 variance across 100K events)

TIER: PASS-STRETCH (headroom beyond targets)
  Throughput:          5,102 events/sec (2.5x target)
  Projection lag p99:  189ms (5x better than target)
  Projection rebuild:  4m 51s (2x better than target)

VERDICT: PASS-TARGET achieved. PROCEED TO PHASE 1.

NOTE: Gate tests ARCHITECTURAL SOUNDNESS, not hardware-dependent numbers.
If running on limited hardware: Pass-minimum (linear scaling) is sufficient
to proceed. Pass-target numbers can be verified on production-grade hardware.
```

---

## Phase 1: Governance Layer

**Duration:** 3 weeks  
**Prerequisite:** Phase 0 exit gate passed  
**Goal:** Production-grade security, privacy, and audit capabilities

### Phase 1.1: Security Model (Week 7)

- Capability-based authorization model (capabilities, duties, roles)
- Segregation of duties enforcement (rule-based, not hardcoded)
- Row-Level Security policies on all projection tables
- Field-level masking based on role capabilities
- Scope hierarchy enforcement (tenant → legal_entity → division/department)
- API key management for external integrations

### Phase 1.2: Privacy Engine (Week 8)

- PII classification per event type (PII manifest)
- Crypto-shredding: per-subject encryption keys in KMS
- PII encryption on event append
- Key destruction workflow (right to erasure)
- Targeted projection rebuild on key destruction
- Consent tracking (what data, what purpose, when granted)
- Data subject access request (DSAR) projection

### Phase 1.3: Audit Engine (Week 9)

- Audit event projection (queryable audit trail)
- Rule evaluation trace storage and query
- Continuous controls monitoring (rules that evaluate patterns across events)
- Tamper evidence (sequence gap detection, hash chain optional)
- Audit report generation (who did what, when, why, authorized by whom)

**Phase 1 Exit Gate:**
```yaml
phase_1_gate:
  security:
    - unauthorized intent rejected in < 50ms
    - RLS enforced on all projection tables (automated test per projection)
    - SoD violation detected and blocked (test with AP invoice scenario)
    - scope isolation verified (entity in legal_entity A invisible from legal_entity B)
  privacy:
    - PII encrypted on event append (verify ciphertext in database)
    - key destruction renders PII unreadable (verify projection shows [REDACTED])
    - DSAR projection returns all data for a subject
  audit:
    - complete audit trace for AP invoice lifecycle (every step traceable)
    - rule evaluation traces queryable by intent_id
    - tamper detection identifies artificially inserted event
```

---

## Phase 2: Organization & First Capability

**Duration:** 5 weeks  
**Prerequisite:** Phase 1 exit gate passed  
**Goal:** Multi-entity support with complete GL and AP capabilities

### Phase 2.1: Multi-Entity & Financial Dimensions (Weeks 10-11)

- Legal entity configuration (COA, fiscal calendar, currency, tax rules per entity)
- Configuration inheritance (default from parent, override at child)
- Financial dimensions (department, cost center, project — configurable)
- Dimension validation rules and default rules
- Number sequence management (per entity, per document type)
- Intercompany event framework (AR/AP matching, elimination subledger)

### Phase 2.2: General Ledger (Weeks 12-13)

- Chart of accounts (hierarchical, multi-segment)
- Journal entry framework (through intent protocol)
- Automatic GL posting from subledger events (AP → GL, AR → GL)
- Period management (open, soft-close, hard-close)
- Trial balance projection (by period, by dimension)
- Financial statement generation (P&L, balance sheet — from projections)
- Back-dated posting handling (with snapshot invalidation)
- Period-end close process (validation rules, closing entries)

### Phase 2.3: Accounts Payable — Full (Week 14)

- Extend Phase 0 AP with full production features:
- Payment run processing (batch payments through intent protocol)
- Payment methods (check, ACH, wire, credit card)
- Vendor credit notes and debit notes
- Withholding tax calculation (rules-based)
- Currency handling (multi-currency invoices, realized/unrealized FX gains)
- AP control account reconciliation

**Phase 2 Exit Gate:**
```yaml
phase_2_gate:
  multi_entity:
    - 3 legal entities operating independently
    - intercompany invoice creates matching AR/AP events
    - elimination subledger correctly matches and reports
    - configuration inheritance verified (parent defaults, child overrides)
  general_ledger:
    - trial balance balances (debits = credits, zero net)
    - financial statements generated from projections
    - period close process completes without error
    - back-dated posting correctly updates prior period
  accounts_payable:
    - full AP lifecycle in two currencies
    - payment run processes 100 invoices correctly
    - withholding tax calculated per rules
    - AP control account reconciles to subledger
```

---

## Phase 3+: Capability Expansion

Subsequent phases follow the same pattern: build capability → stress test → gate → proceed. Detailed plans for Phase 3+ will be produced after Phase 2 delivery, informed by lessons learned.

**Tentative sequencing:**

| Phase | Duration | Capabilities |
|-------|----------|-------------|
| Phase 3 | 4 weeks | Accounts Receivable, Procurement |
| Phase 4 | 4 weeks | Inventory Management, Warehouse Management |
| Phase 5 | 4 weeks | Agent Framework, first autonomous agents (AP processing agent) |
| Phase 6 | 4 weeks | Production Control, Continuous Planning (with time fences) |
| Phase 7 | 4 weeks | CRM, Customer Service |
| Phase 8 | 4 weeks | Interface layer (Conversational UI, Workspace UI) |
| Phase 9 | 4 weeks | Platform (Extensibility, Localization, B2B Event Mesh) |

---

## Appendix: Development Environment

```yaml
development_environment:
  language: TypeScript (strict mode, no implicit any)
  runtime: Node.js 20+ LTS
  database: PostgreSQL 16+
  package_manager: pnpm
  testing:
    unit: vitest
    integration: vitest + testcontainers (PostgreSQL in Docker)
    load: k6 or artillery
    e2e: playwright (for future UI testing)
  linting: eslint + prettier
  ci: GitHub Actions (or equivalent)
  
  project_structure:
    /packages/core/          # Engine: event store, entity graph, rules, projections
    /packages/intent/        # Intent protocol pipeline
    /packages/governance/    # Security, privacy, audit
    /packages/capabilities/  # Business capabilities (gl, ap, ar, etc.)
    /packages/api/           # REST API layer
    /packages/agents/        # Agent framework and implementations
    /tests/                  # Integration and load tests
    /config/                 # Rule definitions, projection configs
    /migrations/             # Database migrations
```

---

## Appendix: Key References

| Document | Purpose |
|----------|---------|
| ARCHITECTURE_SPEC.md | Master architecture (high-level) |
| REVIEW_SYNTHESIS.md | Consolidated review feedback and accepted changes |
| ADR_LOG.md | Architecture decision records with rationale |
| NFR.md | Non-functional requirements and performance targets |
| specs/engine/01_EVENT_STORE.md | Event store deep specification |
| specs/organization/10_FINANCIAL_DIMENSIONS.md | Financial dimensions deep specification |

---

*This build plan is a living document. Phase details beyond Phase 2 are tentative and will be refined based on lessons from earlier phases. The walking skeleton approach ensures we learn fast and correct course early.*
