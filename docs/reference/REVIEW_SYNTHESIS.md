# Project Nova — Architecture Review Synthesis

**Version:** 1.0  
**Date:** February 2026  
**Input:** Three independent third-party architecture reviews of ARCHITECTURE_SPEC.md  
**Purpose:** Consolidate all accepted architectural changes, rejected recommendations with rationale, and resulting specification amendments. This document serves as the authoritative record of post-review changes for reviewer validation.

---

## Table of Contents

1. [Review Overview](#1-review-overview)
2. [Accepted Changes — Engine Layer](#2-accepted-changes--engine-layer)
3. [Accepted Changes — Security & Privacy](#3-accepted-changes--security--privacy)
4. [Accepted Changes — Business Capabilities](#4-accepted-changes--business-capabilities)
5. [Accepted Changes — Agent Layer](#5-accepted-changes--agent-layer)
6. [Accepted Changes — Process & Roadmap](#6-accepted-changes--process--roadmap)
7. [Rejected Recommendations with Rationale](#7-rejected-recommendations-with-rationale)
8. [Specification Impact Matrix](#8-specification-impact-matrix)
9. [Open Questions for Reviewer Validation](#9-open-questions-for-reviewer-validation)

---

## 1. Review Overview

Three independent reviews were conducted against the master ARCHITECTURE_SPEC.md and available deep specs (01_EVENT_STORE.md, 10_FINANCIAL_DIMENSIONS.md). Each reviewer brought different expertise and emphasis:

| Review | Primary Expertise | Strongest Contributions |
|--------|-------------------|------------------------|
| Review A | Distributed systems, protocol design | Crypto-shredding for PII, consistency level formalization, protocol adapter strategy |
| Review B | ERP operations, supply chain, systems engineering | MRP nervousness/time fences, snapshot invalidation, LLM cost tiering, stress test gates |
| Review C | Production systems, DevOps, security | Walking skeleton approach, timestamp semantics, rules engine guardrails, tiered security model |

**Consensus across all three reviews:**
- Core architectural primitives (events, entities, rules, projections, intents) are sound
- Treating agents as first-class participants with system identity is the right approach
- The intent pipeline (receive → validate → plan → approve → execute) is a strong abstraction
- PII compliance needs crypto-shredding, not just field redaction
- Phase 0 timeline is aggressive and needs concrete gate criteria

---

## 2. Accepted Changes — Engine Layer

### 2.1 Event Store: Idempotency Keys with Per-Type Natural Business Key Dedupe

**Source:** Reviews A (intent-level), B (event-level), C (per-type dedupe rules)  
**Severity:** High — prevents duplicate financial postings  
**Affects:** 01_EVENT_STORE.md, 05_INTENT_PROTOCOL.md

The idempotency model operates at two levels:

**Intent-level idempotency** prevents client retry duplication. Every mutation intent carries a client-generated `idempotency_key`. The intent protocol checks this key before processing. If the key exists and the intent has completed, the previous result is returned. If the key exists and the intent is in-progress, the current status is returned. Keys expire after 24 hours.

**Event-level idempotency** prevents logical business duplication using natural keys specific to each event type:

```yaml
event_idempotency:
  # Intent-level: client retry protection
  intent_level:
    key: client_provided_idempotency_key
    ttl: 24_hours
    behavior:
      key_found_completed: return_previous_result
      key_found_in_progress: return_current_status
      key_not_found: process_normally
    required_for: all mutation intents
    optional_for: read-only intents

  # Event-level: business logic duplicate detection
  event_level:
    strategy: natural_business_key_per_event_type
    examples:
      ap.invoice.submitted:
        natural_key: [scope.legal_entity, data.vendor_id, data.invoice_number]
        window: 48_hours
        on_duplicate: reject_with_reference_to_existing
      gl.journal.posted:
        natural_key: [scope.legal_entity, data.journal_number]
        window: permanent  # journal numbers are unique forever
        on_duplicate: reject_with_reference_to_existing
      inventory.adjustment.posted:
        natural_key: [scope.legal_entity, data.item_id, data.location_id, data.reason_code, data.reference]
        window: 1_hour
        on_duplicate: reject_with_reference_to_existing
      payment.executed:
        natural_key: [scope.legal_entity, data.payment_id]
        window: permanent
        on_duplicate: reject_with_reference_to_existing
```

**Implementation note:** Natural key dedupe is enforced via unique partial indexes on the events table, scoped to the relevant columns and time window. This is a database-level guarantee, not application logic.

---

### 2.2 Event Store: Optimistic Concurrency Control for Entity Streams

**Source:** Review C  
**Severity:** High — prevents lost updates in concurrent modification scenarios  
**Affects:** 01_EVENT_STORE.md, 05_INTENT_PROTOCOL.md

When two intents attempt to modify the same entity simultaneously, the system uses optimistic versioning to detect and resolve conflicts:

```yaml
concurrency_control:
  strategy: optimistic_versioning

  mechanism:
    # 1. Intent reads entity with current_version from entity graph
    # 2. Intent processes through pipeline (validate, plan, approve, execute)
    # 3. On event append: include expected_entity_version in metadata
    # 4. Event store checks: actual_version == expected_version
    # 5. Match: append succeeds, entity version incremented atomically
    # 6. Mismatch: ConcurrencyConflictError raised
    # 7. Intent protocol retries from validation step with fresh state

  retry_policy:
    max_retries: 3
    backoff: exponential  # 50ms, 200ms, 800ms
    on_exhaustion: fail_intent_with_conflict_explanation

  scope: per (entity_type, entity_id) within legal_entity partition

  implementation:
    # PostgreSQL advisory locks or version column check in single transaction
    # Event append and version increment happen atomically
    sql_pattern: |
      INSERT INTO events (...)
      SELECT ... WHERE entity_version = $expected_version
      -- Returns 0 rows if version mismatch → ConcurrencyConflictError
```

---

### 2.3 Event Store: Authoritative Timestamp Semantics

**Source:** Review C  
**Severity:** High — prevents accounting period misassignment and ordering bugs  
**Affects:** 01_EVENT_STORE.md, 04_PROJECTION_ENGINE.md, 12_GENERAL_LEDGER.md

Three timestamps serve distinct purposes. Confusing them causes real accounting errors:

```yaml
timestamp_semantics:
  occurred_at:
    description: When the real-world event happened (user's clock or source system time)
    type: ISO 8601 with timezone
    drives:
      - display ordering in activity logs and timelines
      - human-facing "when did this happen" queries
    trust_level: low (user-provided, may be inaccurate or timezone-shifted)
    set_by: client / source system
    immutable: yes (once recorded, never changed)

  recorded_at:
    description: When the event store accepted the event (server monotonic clock)
    type: ISO 8601 UTC + monotonic sequence number within partition
    drives:
      - event ordering within partition (authoritative)
      - subscription delivery order
      - concurrency control (sequence number)
      - event replay sequence
    trust_level: high (system-generated, monotonic within partition)
    set_by: event store server
    immutable: yes
    guarantee: monotonically increasing within partition

  effective_date:
    description: Business date for accounting and reporting purposes
    type: date (no time component — business date only)
    drives:
      - fiscal period assignment
      - financial projection grouping (trial balance by period)
      - period-close logic and reporting dates
      - regulatory reporting periods
    trust_level: medium (user-provided but validated against business rules)
    set_by: client, with rules engine validation
    immutable: yes
    constraint: must fall within an open or soft-closed fiscal period

  ordering_rules:
    within_partition: recorded_at sequence number is authoritative
    cross_partition: no global ordering guarantee (eventual consistency)
    for_projections: process events by recorded_at order; bucket results by effective_date
    for_queries: display by occurred_at unless user requests system ordering

  late_arriving_events:
    scenario: Event arrives today with effective_date in a prior period
    handling:
      period_open:
        action: process normally
        projection_impact: prior period balances updated
        snapshot_impact: lazy invalidation of affected period snapshots
      period_soft_closed:
        action: route to approval workflow
        approver: controller or CFO (configurable per legal entity)
        on_approval: process and update prior period
        on_rejection: reject intent; user must post to current period
      period_hard_closed:
        action: reject
        guidance: post adjusting entry to current period instead
```

---

### 2.4 Event Store: Formalized Event Delivery Model

**Source:** Reviews B (outbox pattern), C (durable subscriptions, LISTEN/NOTIFY limitations)  
**Severity:** Medium — prevents silent event delivery failures  
**Affects:** 01_EVENT_STORE.md, 04_PROJECTION_ENGINE.md

The events table IS the outbox. LISTEN/NOTIFY is a wakeup optimization, not a delivery guarantee:

```yaml
event_delivery:
  architecture:
    source_of_truth: events table (append-only, durable)
    notification: PostgreSQL LISTEN/NOTIFY (best-effort wakeup signal)
    delivery: pull-based from cursor position (durable, at-least-once)

  mechanism:
    # 1. Event appended to events table (single atomic transaction)
    # 2. LISTEN/NOTIFY fired (best effort — may fail, that's acceptable)
    # 3. Subscriber receives NOTIFY → polls from last acknowledged cursor position
    # 4. If NOTIFY missed → subscriber polls on interval (fallback, configurable)
    # 5. Subscriber processes event → acknowledges by updating cursor position
    # 6. Cursor position stored in subscriptions table (durable)

  guarantees:
    delivery: at-least-once (cursor only advances after successful processing)
    ordering: strict within partition (by recorded_at sequence number)
    deduplication: subscriber responsibility (idempotent handlers required)
    replay: subscriber resets cursor to any past position for full replay

  configuration:
    poll_interval_fallback: 500ms  # if NOTIFY missed
    batch_size: 100  # events per poll cycle
    max_processing_time: 30s  # per event before timeout
    dead_letter_threshold: 5  # consecutive failures before dead-lettering

  # No separate outbox table needed — the events table IS the durable log
  # No separate message bus needed at MVP scale

  upgrade_triggers:
    # When to consider dedicated message transport (Redis Streams, NATS JetStream)
    - subscriber_count > 50 concurrent connections
    - notification_latency_p99 > 200ms consistently
    - need topic-based routing beyond "new event in partition"
    # Events table remains source of truth regardless of transport layer
```

---

### 2.5 Event Store: Schema Evolution Policy

**Source:** Reviews A (upcasting methodology), B (formalized upcaster pattern)  
**Severity:** Medium — already addressed in deep spec, needs explicit decision framework  
**Affects:** 01_EVENT_STORE.md

The Event Store spec (Section 5) already defines versioned event types with migration functions. This addendum provides the explicit policy matrix for schema changes:

```yaml
schema_evolution_policy:
  additive_change:
    description: New optional field added to event payload
    example: Adding optional 'cost_center' to gl.journal.posted
    version_bump: no
    migration: none — tolerant readers ignore unknown fields
    risk: low

  required_field_addition:
    description: New required field that must be present in all versions
    example: Adding required 'currency_code' to payment events
    version_bump: yes (e.g., v1 → v2)
    migration: upcaster provides default value when hydrating v1 events
    implementation: normalizeToLatest function in event type registry
    risk: medium — migration function must handle all edge cases

  structural_change:
    description: Field renamed, type changed, or nested structure reorganized
    example: Changing 'amount' from number to { value, currency } object
    version_bump: yes
    migration: upcaster middleware transforms on read during projection rebuild
    risk: medium-high — must verify all projections handle both shapes

  semantic_change:
    description: Field meaning changes (same name, different semantics)
    example: 'tax_amount' changing from inclusive to exclusive
    action: NEW EVENT TYPE (do not reuse field name with changed semantics)
    risk: high if attempted as in-place change — new event type eliminates risk

  breaking_change:
    description: Incompatible restructuring of event payload
    action: new event type with new name
    old_type: deprecated (never deleted, never modified)
    risk: low (clean separation)

  PROHIBITED:
    - copy_and_transform: NEVER rewrite historical events into new format
    - in_place_update: NEVER modify existing events in the event store
    - delete_old_versions: NEVER remove old event type definitions
    rationale: immutability is a non-negotiable architectural invariant
```

---

### 2.6 Projection Engine: Consistency Levels Per Operation Type

**Source:** Review A  
**Severity:** High — prevents stale-data decisions on critical operations  
**Affects:** 04_PROJECTION_ENGINE.md, 05_INTENT_PROTOCOL.md

Not all operations need the same consistency guarantee. Dashboards can lag. Payment execution cannot:

```yaml
consistency_levels:
  eventual:
    description: Read from projections; may lag event store by up to 500ms
    staleness: typically <100ms, worst case <500ms
    use_for:
      - dashboards and analytics
      - reports and visualizations
      - search results
      - non-critical UI displays
    mechanism: read from projection tables (standard CQRS read path)

  strong:
    description: Read authoritative state from event store for critical decisions
    staleness: zero (reading source of truth)
    latency: 5-20ms additional vs eventual
    use_for:
      - inventory allocation (check real available quantity)
      - payment execution (verify balance before disbursement)
      - credit limit enforcement (calculate actual exposure)
      - duplicate detection (verify no prior identical event)
    mechanism: compute current state from event stream for the specific entity

  verified:
    description: Plan using projection, verify against event store before execute
    staleness: zero at execution point
    latency: projection read + verification read
    use_for:
      - high-value intents (above configurable threshold)
      - intents flagged for extra verification by rules engine
      - operations during peak-load periods where projection lag increases
    mechanism: |
      1. Use projection for planning and UI display (fast)
      2. Before execute step: re-validate critical assertions against event store
      3. If projection was stale and assertions fail: re-plan with fresh state
      4. If assertions pass: execute

  configuration:
    # Per intent type, configurable by legal entity
    default: eventual
    overrides:
      payment.execute: strong
      inventory.allocate: strong
      credit.check: strong
      gl.period.close: verified
      # Threshold-based elevation
      amount_threshold: 100000  # intents above this use 'verified' consistency
```

---

### 2.7 Projection Engine: Snapshot Invalidation Strategy

**Source:** Review B  
**Severity:** High — prevents stale financial statements after back-dated postings  
**Affects:** 04_PROJECTION_ENGINE.md, 12_GENERAL_LEDGER.md

When a back-dated event arrives (effective_date before existing snapshot point), affected snapshots must be invalidated:

```yaml
snapshot_invalidation:
  trigger: event.effective_date < snapshot.as_of_point

  strategies:
    eager:
      description: Back-dated event triggers immediate snapshot rebuild
      projections: [trial_balance, subledger_balances, period_close_status]
      latency_impact: write path slower (triggers async rebuild), read path unaffected
      use_when: financial projections where stale data causes compliance risk

    lazy:
      description: Mark snapshot as stale; rebuild on next read
      mechanism: set snapshot.status = 'potentially_stale'
      on_next_read: rebuild from last known-good snapshot + subsequent events
      latency_impact: first read after invalidation is slower; subsequent reads normal
      use_when: operational projections where brief staleness is acceptable

    scheduled:
      description: Rebuild on next scheduled refresh cycle
      use_when: analytical projections where near-real-time isn't required

  default_assignment:
    financial_projections: eager
    operational_projections: lazy
    analytical_projections: scheduled

  fiscal_period_protection:
    # Back-dated postings to closed periods require approval
    # This is enforced at the rules engine level, reducing snapshot invalidation frequency
    closed_period_posting: requires_approval
    locked_period_posting: prohibited

  implementation:
    # Snapshot metadata table tracks:
    # - projection_type, partition_key, as_of_sequence, as_of_point
    # - status: 'valid' | 'potentially_stale' | 'rebuilding'
    # - last_validated_at
    # Back-dated event handler queries snapshot metadata for affected partitions
    # and updates status accordingly
```

---

### 2.8 Projection Engine: Granular Partition Keys for Parallel Processing

**Source:** Reviews B, C  
**Severity:** Medium — enables true horizontal scaling of projection processing  
**Affects:** 04_PROJECTION_ENGINE.md

Projection workers scale horizontally by processing different partition key ranges in parallel. Within a single partition key, events are processed strictly in order:

```yaml
projection_partitioning:
  principle: |
    Events are partitioned by legal_entity in the event store.
    Projections can use finer-grained partition keys for parallelism.
    Ordering is strict within a partition key. Different partitions process concurrently.

  partition_strategies:
    trial_balance:
      partition_key: [legal_entity, account_code]
      parallelism: 500-2000 partitions per legal entity
      ordering: strict within partition
      rationale: each account balance is independent

    bank_balance:
      partition_key: [legal_entity, bank_account_id]
      parallelism: 5-20 per legal entity
      ordering: strict (running balance requires sequence)

    inventory_on_hand:
      partition_key: [legal_entity, site, warehouse, item_id]
      parallelism: thousands
      ordering: strict within partition

    fifo_costing:
      partition_key: [legal_entity, site, item_id]
      parallelism: thousands
      ordering: strict (layer consumption order matters)

    ap_subledger:
      partition_key: [legal_entity, vendor_id]
      parallelism: hundreds to thousands
      ordering: strict within partition

    ar_subledger:
      partition_key: [legal_entity, customer_id]
      parallelism: hundreds to thousands
      ordering: strict within partition

  routing_mechanism:
    # Event arrives → extract partition key fields → consistent hash → worker assignment
    # Worker processes events for assigned partition key ranges in sequence
    # Different workers process different partition key ranges concurrently
    # Rebalancing: on worker add/remove, reassign partition ranges (Kafka consumer group model)
    hash_function: consistent_hash(partition_key) → worker_id
    rebalancing: automatic on worker pool changes
```

---

### 2.9 Projection Engine: Archival-Integrity Rules

**Source:** Review B  
**Severity:** Medium — prevents data loss when archiving old events  
**Affects:** 04_PROJECTION_ENGINE.md, 01_EVENT_STORE.md

Events cannot be archived to cold storage unless all dependent projections have valid snapshots covering the archived range:

```yaml
archival_rules:
  precondition: |
    Before archiving any event stream segment, ALL projections that depend on
    those events must have a valid snapshot covering the archived range.
    This ensures current state can always be computed from snapshot + remaining online events.

  process:
    step_1: identify events eligible for archival (older than retention threshold)
    step_2: for each affected entity stream, enumerate dependent projections
    step_3: for each dependent projection, verify snapshot exists with as_of_sequence >= last_archived_sequence
    step_4: if any snapshot missing or stale → block archival, trigger snapshot creation
    step_5: archive events to cold storage (S3, Glacier, etc.)
    step_6: retain event metadata in primary store (event_id, stream_id, sequence, occurred_at — no payload)

  guarantees:
    current_state: always computable from snapshot + recent online events
    full_history_replay: available via cold storage retrieval (higher latency)
    entity_graph_integrity: entity current state always derivable without cold storage

  cold_storage_retrieval:
    trigger: explicit request (auditor investigation, legal discovery, full history replay)
    latency: minutes to hours depending on storage tier
    mechanism: restore archived events to temporary online partition → process → archive again
```

---

## 3. Accepted Changes — Security & Privacy

### 3.1 Cryptographic Erasure (Crypto-Shredding) for PII Compliance

**Source:** Reviews A, C  
**Severity:** Critical — current redaction approach has GDPR Article 17 compliance risk  
**Affects:** 07_PRIVACY_ENGINE.md, 01_EVENT_STORE.md

Field-level redaction leaves plaintext PII in WAL files, backups, and replicas. Crypto-shredding is the accepted industry solution for event-sourced systems:

```yaml
crypto_shredding:
  principle: |
    Every data subject gets a unique encryption key. PII fields are encrypted with this
    key before event append. Non-PII fields remain plaintext for querying. On deletion
    request, the key is destroyed. Encrypted fields become permanently unreadable noise.
    Event skeleton is preserved (causality, timestamps, non-PII data intact).

  mechanism:
    key_management:
      store: dedicated mutable KMS (NOT the event store)
      granularity: one key per data_subject (e.g., per customer, per employee, per vendor contact)
      rotation: supported (re-encrypt with new key on rotation schedule)
      backup: KMS has its own backup strategy, separate from event store backups

    on_event_append:
      step_1: classify fields as PII or non-PII (per event type PII manifest)
      step_2: retrieve data subject's encryption key from KMS
      step_3: encrypt PII fields with subject's key (AES-256-GCM)
      step_4: append event with encrypted PII fields + plaintext non-PII fields
      step_5: non-PII fields available for indexing, querying, projection building

    on_deletion_request:
      step_1: verify deletion request (right to erasure, identity verification)
      step_2: destroy encryption key in KMS
      step_3: encrypted PII fields in all events become permanently unreadable
      step_4: trigger projection rebuild for affected data subject
      step_5: projections rebuild → encounter encrypted PII → cannot decrypt → write "[REDACTED]"
      step_6: event skeleton preserved (audit trail intact, causality preserved)
      step_7: log deletion event: "privacy.subject.key_destroyed" (non-PII metadata only)

    projection_pii_handling:
      rule: projections that denormalize PII fields must be flagged as pii_containing
      on_key_destruction: targeted rebuild of affected projections
      optimization: track data_subject → projection mappings for surgical rebuild

  fallback:
    # SQL-based field redaction remains as secondary mechanism for:
    - pre_implementation_events: events created before crypto-shredding was active
    - migration_data: imported historical data not yet encrypted
    - edge_cases: fields that escaped PII classification
```

---

### 3.2 Tiered Security Isolation Model

**Source:** Review C  
**Severity:** High — prevents over-partitioning while maintaining strong isolation  
**Affects:** 06_SECURITY_MODEL.md, 04_PROJECTION_ENGINE.md

Not all organizational dimensions warrant structural isolation. The model uses three tiers:

```yaml
security_isolation_tiers:
  tier_1_structural:
    dimensions: [tenant_id, legal_entity]
    isolation_type: physical separation
    implementation:
      - separate event store partitions
      - separate projection table partitions
      - separate encryption key scopes
      - separate retention and archival policies
    rationale: |
      These are hard legal and regulatory boundaries. Data must NEVER leak across these
      boundaries under any circumstance. Structural isolation eliminates an entire class
      of authorization bugs — there is no query that can accidentally cross boundaries.
    cost: moderate (typically 1 tenant with 2-20 legal entities)
    cross_boundary_access: only through explicit consolidation projections with audited rules

  tier_2_row_level:
    dimensions: [division, department, site, region, cost_center]
    isolation_type: PostgreSQL Row Level Security (RLS) policies
    implementation:
      - RLS policies on projection tables
      - user session context sets current scope dimensions
      - all queries automatically filtered by active scope
    rationale: |
      These are organizational boundaries within a legal entity. Data isolation is
      important for access control but doesn't require physical separation. Same legal
      entity, same audit requirements, same consolidation.
    cost: low (filter predicates, no data duplication)
    cross_boundary_access: governed by role capabilities (user with multi-division role sees both)

  tier_3_field_level:
    dimensions: [role, clearance_level, data_classification]
    isolation_type: field masking in projection query layer
    implementation:
      - projection query layer checks role capabilities per field
      - sensitive fields masked or omitted based on role
    rationale: |
      User can see the entity exists but not all attributes. AP clerk sees invoice
      exists and status but not strategic pricing terms or vendor bank details.
    cost: minimal (per-field access check on read)

  isolation_hierarchy:
    tenant_id:
      description: top-level SaaS customer isolation (if multi-tenant deployment)
      isolation: complete (separate encryption, separate backups, no cross-tenant queries ever)
      single_tenant_mode: tenant_id is fixed constant, effectively invisible
    legal_entity:
      description: legal entity within a tenant (subsidiaries, holding companies)
      isolation: structural (separate partitions per above)
      cross_entity: only via consolidation projections
    division_department_site:
      description: organizational dimensions within a legal entity
      isolation: row-level security
      cross_scope: governed by role capabilities
```

---

## 4. Accepted Changes — Business Capabilities

### 4.1 Continuous Planning: Time Fences and Damping Rules

**Source:** Review B  
**Severity:** High — prevents MRP nervousness that destroys operational stability  
**Affects:** 19_CONTINUOUS_PLANNING.md

Real-time computation of net requirements is correct. Real-time autonomous actioning of those requirements is dangerous without governance:

```yaml
planning_governance:
  principle: |
    The system computes demand/supply variance in real-time. But autonomous action
    is governed by time fences and damping rules to prevent system nervousness.
    Small changes accumulate; only significant deviations trigger re-planning.

  time_fences:
    frozen_horizon:
      description: Inside this window, planned orders are locked
      default: 7_days
      configurable_per: [item_coverage_group, site, item]
      system_behavior: compute variance, display to planners, do NOT auto-modify orders
      action_on_variance: flag_for_human_review (exception message)
      override: manual only (planner explicitly unlocks and modifies)

    firm_horizon:
      description: Inside this window, system can adjust quantities but not create/cancel
      default: 14_days
      configurable_per: [item_coverage_group, site, item]
      system_behavior: adjust existing order quantities if variance exceeds threshold
      action_on_variance: auto_adjust_if_threshold_exceeded, else flag
      cannot: create new planned orders or cancel existing ones

    planning_horizon:
      description: Outside firm horizon, full autonomous planning
      default: 90_days
      configurable_per: [item_coverage_group, planning_group]
      system_behavior: create, modify, cancel planned orders autonomously
      action_on_variance: autonomous within agent boundaries

  damping_rules:
    quantity_damping:
      description: Don't re-plan unless quantity variance exceeds threshold
      default: 10_percent OR minimum_order_quantity (whichever is larger)
      configurable_per: [item, coverage_group]
      
    time_damping:
      description: Don't re-schedule unless date moves by more than threshold
      default: 2_days
      configurable_per: [item, coverage_group]

    accumulation_window:
      description: Batch demand changes within window before evaluating re-plan
      default: 15_minutes
      rationale: prevents thrashing from rapid-fire small order modifications
      mechanism: buffer demand signals, evaluate net change at window boundary

    cascade_damping:
      description: Limit propagation depth of planning changes
      max_cascade_depth: 3  # a change to a finished good can cascade to
                            # subassembly → component → raw material (3 levels)
                            # but not further without human review
```

---

### 4.2 Intercompany Elimination Subledger

**Source:** Review B  
**Severity:** Medium — auditors require transparent elimination trail  
**Affects:** 09_MULTI_ENTITY.md, 12_GENERAL_LEDGER.md

Auto-matched intercompany eliminations must be queryable and auditable:

```yaml
elimination_subledger:
  description: |
    Explicit projection showing every intercompany elimination with full trace.
    Auditors can query to prove WHY and HOW two events cancelled each other.

  projection_fields:
    - elimination_id
    - originating_entity (legal entity code)
    - originating_event_id (specific event reference)
    - originating_account
    - originating_amount
    - counterparty_entity (legal entity code)
    - counterparty_event_id (specific event reference)
    - counterparty_account
    - counterparty_amount
    - causal_link (correlation_id connecting the pair)
    - elimination_amount
    - fx_adjustment (exchange rate difference, if applicable)
    - elimination_debit_account
    - elimination_credit_account
    - match_method: auto_causal | auto_reference | manual
    - status: matched | partial | unmatched | disputed
    - matched_at (timestamp)
    - matched_by (system or user identity)

  auditor_queries:
    all_unmatched: "Show all intercompany transactions without matching counterparty"
    entity_pair_summary: "Show all eliminations between USMF and GBUK for Q3"
    drill_to_source: "Why was this elimination $125K? Show originating events on both sides"
    fx_impact: "Show all eliminations with FX adjustments above $1K"
    aging: "Show unmatched intercompany transactions older than 30 days"
```

---

## 5. Accepted Changes — Agent Layer

### 5.1 Agent Authority Model: LLM as Planner, Not Authority

**Source:** Review C  
**Severity:** High — fundamental design principle for agent safety  
**Affects:** 25_AGENT_FRAMEWORK.md, 05_INTENT_PROTOCOL.md

```yaml
agent_authority_model:
  principle: "The LLM reasons and proposes. The system validates and decides."

  llm_responsibilities:
    - interpret natural language into structured intent
    - suggest actions based on context and patterns
    - provide reasoning traces for audit
    - identify anomalies and draft investigation plans
    - generate plans for multi-step operations

  llm_prohibitions:
    - NEVER authorizes its own actions (rules engine validates)
    - NEVER bypasses approval workflows
    - NEVER escalates its own trust level
    - NEVER accesses data outside its assigned scope
    - NEVER modifies its own capability boundaries

  policy_gate:
    location: between intent.plan and intent.execute (deterministic, no LLM in the loop)
    evaluator: rules engine (deterministic rule evaluation, not AI judgment)
    logs:
      - agent_proposed_action (what the LLM wanted to do)
      - system_authorization_decision (what the rules engine allowed)
      - divergence_flag (if agent proposed something the system didn't allow)
    on_divergence: log, execute system decision, notify supervisor if repeated
```

---

### 5.2 AI Routing Tiers and Provider Abstraction

**Source:** Reviews B (cost/latency tiers), C (provider abstraction, degradation modes)  
**Severity:** Medium — prevents unsustainable API costs and single-provider dependency  
**Affects:** 25_AGENT_FRAMEWORK.md, 28_CONVERSATIONAL_UI.md

```yaml
ai_routing:
  tier_1_deterministic:
    description: Structured inputs from UI forms, APIs, system events
    model: none (direct mapping to intent, no LLM invocation)
    latency: <5ms
    cost: zero
    volume: ~80% of all intents
    examples:
      - user submits form → structured data → intent
      - API call with typed JSON payload → intent
      - system event triggers rule → intent

  tier_2_lightweight:
    description: Semi-structured inputs needing classification or extraction
    model: local small model or fine-tuned classifier
    latency: <50ms
    cost: minimal (local inference)
    volume: ~15% of all intents
    examples:
      - email parsed into expense report fields
      - document OCR with field extraction
      - voice command classified into intent type

  tier_3_reasoning:
    description: Unstructured inputs requiring understanding and judgment
    model: frontier LLM (Claude or equivalent)
    latency: 1-5 seconds (acceptable for these use cases)
    cost: managed through caching and smart routing
    volume: ~5% of all intents
    examples:
      - natural language conversation requiring context understanding
      - complex anomaly investigation and root cause analysis
      - cross-domain agent reasoning and negotiation
      - ambiguous intent resolution requiring business judgment

  provider_abstraction:
    interface: AIReasoningService
    implementations: [anthropic_claude, openai_gpt, local_llm, rule_based_fallback]
    selection: configurable per intent type and criticality

  degradation_modes:
    llm_unavailable:
      tier_1: unaffected (no LLM dependency)
      tier_2: fall back to rule-based classification (reduced accuracy, functional)
      tier_3: queue for processing when service returns, or route to human
      conversational_ui: display "AI assistant temporarily unavailable — please use structured forms"
      agents: pause autonomous operations, queue intents for human review
```

---

### 5.3 External Protocol Adapter Strategy

**Source:** Review A  
**Severity:** Low — design decision for future extensibility  
**Affects:** 27_A2A_PROTOCOL.md, 37_B2B_EVENT_MESH.md

```yaml
protocol_strategy:
  principle: |
    The intent protocol is the stable internal core. External protocols are integration
    adapters. Protocols evolve and get replaced; the intent protocol persists.

  internal_agents: nova_intent_protocol (native, purpose-built, typed)
  external_ai_tools: mcp_adapter (optional, for external AI tools accessing Nova)
  cross_enterprise: nova_a2a_protocol + standard_bridge (adopt A2A/ACP standards as adapter when stabilized)
  legacy_systems: REST API, webhooks, file-based import/export
```

---

## 6. Accepted Changes — Process & Roadmap

### 6.1 Revised Phase 0: Walking Skeleton Approach

**Source:** Review C  
**Severity:** High — restructures the most critical development phase  
**Affects:** roadmap/BUILD_PLAN.md (see separate document)

Phase 0 restructured from sequential component development to vertical-slice-first approach. By end of Week 2, one intent flows through the complete pipeline: intent → rules → events → projection → query → audit trace. Full details in BUILD_PLAN.md.

---

### 6.2 Stress Test Gate Before Phase 1

**Source:** Reviews B, C  
**Severity:** High — prevents building on an unvalidated foundation  
**Affects:** roadmap/BUILD_PLAN.md

```yaml
phase_0_exit_gate:
  required_before_phase_1:
    throughput: append >2,000 events/second per legal entity partition
    projection_lag: <1 second p99 under sustained load
    projection_rebuild: 1M events replayed and projected in <10 minutes
    concurrent_intents: 50 concurrent intents against same entity resolve correctly (no lost updates)
    schema_migration: introduce event version change, rebuild projection, verify correctness
    back_dated_event: post to prior period, verify snapshot invalidation and projection update
    idempotency: duplicate intent submission returns original result (not double-posting)

  test_methodology:
    - synthetic event generator producing realistic AP/GL event streams
    - load test harness running concurrent intent submissions
    - automated correctness verification (trial balance reconciliation after load test)
```

---

### 6.3 Meta-Specifications to Produce

**Source:** Review C  
**Severity:** Medium-High — keeps architecture honest during implementation  
**Affects:** specs/reference/ directory

| Meta-Spec | Priority | Status |
|-----------|----------|--------|
| NFR document (throughput targets, latency SLAs, rebuild budgets) | High — produced alongside this synthesis | See NFR.md |
| ADR log (architecture decision records) | High — produced alongside this synthesis | See ADR_LOG.md |
| Threat model + agent abuse cases | High — produce before agent framework spec | Queued |
| Integration strategy (inbound/outbound patterns) | Medium — produce before Phase 2 | Queued |
| Migration & coexistence plan | Medium — produce before first deployment | Queued |

---

## 7. Rejected Recommendations with Rationale

### 7.1 REJECTED: Synchronous Projection Updates for Critical Operations

**Source:** Review A  
**Proposed:** Make projections update synchronously for high-stakes operations.  
**Rejected because:** This defeats the entire purpose of CQRS. Synchronous projection updates create write-path bottlenecks and couple the write model to read model performance. The correct solution is consistency levels (Section 2.6) — critical operations read from the event store directly, bypassing projections entirely. Same consistency guarantee, no architectural compromise.

### 7.2 REJECTED: Copy-and-Transform Event Migration

**Source:** Review A  
**Proposed:** Migrate old events by copying and transforming them into new schema versions.  
**Rejected because:** This violates event store immutability — a non-negotiable architectural invariant. The correct approach is upcasting on read (Section 2.5): migration functions transform old events into current schema during projection rebuild, without modifying the original events.

### 7.3 REJECTED: Native Embedding of External Agent Protocols (MCP, ACP, A2A)

**Source:** Review A  
**Proposed:** Adopt MCP, ACP, and Google A2A as native internal protocols.  
**Rejected because:** Internal agents don't need protocol discovery or multi-vendor coordination. They're purpose-built actors with direct typed access through the intent protocol. Adding protocol intermediaries introduces complexity, latency, and abstraction layers with no proportional benefit for internal operations. External protocols are supported via adapter layers (Section 5.3).

### 7.4 REJECTED: Rewrite Core Engine in Rust/Go/C# for Performance

**Source:** Review B  
**Proposed:** Build projection engine, rules engine, and graph traversal in a systems language.  
**Rejected because:** Premature optimization. ERP projection workloads are I/O-bound (database reads/writes), not CPU-bound. TypeScript with worker threads handles the target scale. The risk at MVP stage is getting abstractions right, not runtime performance. A multi-language codebase doubles development effort, build complexity, and hiring requirements. If profiling data shows a specific CPU bottleneck after MVP, we extract the hot path to Rust — targeted optimization with real data, not speculative rewrite. See ADR-005.

### 7.5 REJECTED: Use Existing CQRS/Event Sourcing Frameworks

**Source:** Review B  
**Proposed:** Leverage existing frameworks (Axon, Marten, etc.) instead of building bespoke.  
**Rejected because:** Existing frameworks embed opinions about aggregate roots, command handlers, saga patterns, and projection frameworks that conflict with our architecture. Our entity graph isn't a traditional aggregate root. Our rules engine isn't a command handler. Our intent protocol isn't a saga. Adapting a framework to our model is as much work as building the focused components we need, with the added burden of fighting framework assumptions. See ADR-006.

### 7.6 REJECTED: Hierarchical Intent Queuing with Priority Classes

**Source:** Review A  
**Proposed:** Deterministic conflict resolution through priority-based intent queuing.  
**Rejected because:** Intent conflicts in ERP are concurrency control problems, not queue scheduling problems. Two agents allocating the last inventory unit is solved by optimistic concurrency control (Section 2.2) — first to commit wins, second retries with fresh state. Strategic coherence (aggregate agent behavior aligning with organizational goals) is a rules engine concern, not a queuing concern. Cross-agent constraints are evaluated during intent validation, not by queue priority.

---

## 8. Specification Impact Matrix

Which existing and future specs are affected by review changes:

| Spec | Changes Required |
|------|-----------------|
| **01_EVENT_STORE.md** (existing) | Add: per-type idempotency keys, optimistic concurrency, timestamp semantics, delivery model formalization, archival-integrity rules, crypto-shredding encryption layer |
| **02_ENTITY_GRAPH.md** (queued) | Add: supported traversal patterns and depth limits for MVP, deferred identity resolution scope |
| **03_RULES_ENGINE.md** (queued) | Add: execution phases, cycle detection, conflict resolution, rule fire budgets |
| **04_PROJECTION_ENGINE.md** (queued) | Add: consistency levels, snapshot invalidation, granular partition keys, backpressure/replay strategy |
| **05_INTENT_PROTOCOL.md** (queued) | Add: intent-level idempotency, consistency level per intent type, AI routing tiers |
| **06_SECURITY_MODEL.md** (queued) | Add: tiered isolation model (structural/RLS/field-level), tenant_id vs legal_entity hierarchy |
| **07_PRIVACY_ENGINE.md** (queued) | Add: crypto-shredding as primary mechanism, projection PII tracking, consent-driven projection rebuilds |
| **09_MULTI_ENTITY.md** (queued) | Add: elimination subledger projection, intercompany transparency requirements |
| **19_CONTINUOUS_PLANNING.md** (queued) | Add: time fences, damping rules, accumulation windows, cascade limits |
| **25_AGENT_FRAMEWORK.md** (queued) | Add: authority model (LLM as planner not authority), AI routing tiers, provider abstraction, degradation modes |
| **roadmap/BUILD_PLAN.md** (new) | Complete rewrite: walking skeleton approach, stress test gate |
| **reference/ADR_LOG.md** (new) | New document: architecture decision records |
| **reference/NFR.md** (new) | New document: non-functional requirements |

---

## 9. Open Questions — RESOLVED

All seven open questions were resolved through Round 2 reviewer validation. Both reviewers converged on the same answers for all items:

| # | Question | Resolution | Confidence |
|---|----------|-----------|------------|
| 1 | Consistency level defaults | **Eventual is correct default.** Add three layers: class-based defaults (financial/inventory → strong), mandatory explicit declaration for critical classes, CI policy test suite that asserts every intent type has assignment. No implicit fall-through. | Both reviewers agree |
| 2 | Crypto-shredding sync vs async | **Synchronous, non-negotiable.** If plaintext PII reaches PostgreSQL WAL before encryption, it persists in replicas and backups — defeating the entire mechanism. 1-2ms AES-256-GCM overhead is acceptable. Use envelope encryption (cached DEK per subject) to avoid KMS network calls on every write. | Both reviewers agree |
| 3 | Time fence defaults | **7/14 day defaults are good for discrete manufacturing.** Must be configurable at coverage group level. Retail: 1/3 days. Heavy machinery: 30/60 days. Provide "when to change" guidance per industry vertical. | Both reviewers agree |
| 4 | Trial balance partition key | **[legal_entity, fiscal_year, account_code].** Without fiscal_year, a 10-year-old account becomes one massive unbounded partition. Fiscal year time-boxes partition growth and enables year-level rebuild parallelism. | Both reviewers agree |
| 5 | Rules engine phases | **Four phases sufficient for MVP.** Two invariants enforced: only post_commit causes external side effects; decide phase is pure (emits events but doesn't "do things"). Compensate/retry phase deferred to Phase 1. | Both reviewers agree |
| 6 | Walking skeleton first slice | **Stick with vendor creation + AP invoice.** One reviewer suggested starting with GL journal posting; the other confirmed our current plan. GL is mathematically simple; AP forces cross-entity references, 3-way matching, approval workflows, and SoD. AP is the harder test. | Reviewers split; we keep current plan |
| 7 | Stress test thresholds | **Targets are realistic.** Add tiered pass criteria: Pass-minimum (architecture scales linearly, no pathological behavior), Pass-target (meets stated numbers), Pass-stretch (headroom). Gate should test architectural soundness, not hardware-dependent raw numbers. | Both reviewers agree |

---

## 10. Round 2 Validation — Additional Changes Accepted

The following items emerged from Round 2 reviewer feedback and are incorporated into the architecture:

### 10.1 Consistency Governance — Three-Layer Protection

Prevents "accidentally left a critical intent as eventual":

```yaml
consistency_governance:
  layer_1_class_defaults:
    financial_mutation: strong
    inventory_mutation: strong
    period_operation: verified
    entity_mutation: eventual
    read_only: eventual
  layer_2_mandatory_declaration:
    rule: financial/inventory mutation intents MUST have explicit consistency_level
    on_missing: registration fails at startup
  layer_3_policy_test_suite:
    asserts: every registered intent has explicit assignment; no financial intent is eventual
    runs: CI pipeline, blocks deployment on failure
```

### 10.2 Envelope Encryption for Crypto-Shredding Performance

Avoids KMS network call on every write:

```yaml
envelope_encryption:
  kek: key-encryption-key (in KMS, never leaves KMS)
  dek: data-encryption-key (per subject, encrypted by KEK, cached locally with TTL)
  on_write_cache_hit: ~1ms (local AES-256-GCM only)
  on_write_cache_miss: ~5-10ms (KMS unwrap + crypto)
  expected_cache_hit_rate: ">95%"
```

### 10.3 Strong-Read Entity Snapshots (First-Class)

Strong reads that fold entity event streams need their own snapshot strategy, separate from projection snapshots:
- Snapshot trigger: entity stream > 100 events since last snapshot
- Fold timeout: 500ms; on timeout, degrade to "verified" consistency with warning
- Invalidation: back-dated events mark entity snapshot as stale
- See Event Store spec Section 11.5

### 10.4 NOTIFY Payload Constraint

PostgreSQL NOTIFY has 8,000-byte payload limit. Payload must be minimal signal only: `{partition, sequence}`. Never event data. See Event Store spec Section 3.1 (updated).

### 10.5 Blue/Green Projection Rebuilds

Zero-downtime projection rebuild for schema migrations: create v2 table, hydrate from event replay while v1 serves reads, atomic swap when v2 catches up to live cursor. Implement by Phase 2.

### 10.6 Intent Processing QoS Classes

Priority classes as operational throughput tool (NOT conflict resolution): critical (payments, allocations), normal (invoices, journals), background (reports, dashboards). Conflict resolution remains optimistic concurrency per ADR-009.

### 10.7 Tiered Phase 0 Gate Criteria

- **Pass-minimum:** Architecture scales linearly, no unbounded lag growth, no lock thrash, no memory leaks
- **Pass-target:** Meets stated NFR numbers (2K eps, <1s p99 lag, 10min rebuild)
- **Pass-stretch:** Headroom beyond targets (5K eps, <200ms lag, 5min rebuild)

Gate tests architectural soundness, not hardware-dependent numbers.

### 10.8 NFR Phasing — Phase 0 Scope Control

Each NFR item labeled as "Phase 0: prove mechanism exists" vs "Phase 1+: harden." Prevents walking skeleton from stalling under full operational requirements. Phase 0: structured logging, one OTel trace, basic health check, RLS on one table, one load test. Phase 1+: full metrics, alerting, all RLS, crypto-shredding with KMS, OAuth/OIDC.

### 10.9 RLS as Phase 0 Deliverable

RLS policy on at least one projection table (vendor_list) in Phase 0.2 with automated enforcement test in CI. Proves the pattern before Phase 1 applies it to all projections.

### 10.10 Archival Invariants

Four invariants formalized for long-term system health: current state always online, full history always possible (may need cold storage), archived events remain replayable, event metadata never archived. See Event Store spec Section 11.4.

### 10.11 ADR-006 Clarification — Frameworks vs Libraries

Reject frameworks that impose domain structure. Accept libraries that don't impose architecture. Rule of thumb: if it dictates how you model entities, commands, or events → reject. If it validates schemas, handles crypto, or formats logs → accept.

---

## 11. Specification Updates Applied

| Spec | Update Type | Status |
|------|------------|--------|
| **01_EVENT_STORE.md** | Inline edits (schema, NOTIFY, PII) + Review Addendum (Sections 11.1-11.6) | ✅ Updated |
| **REVIEW_SYNTHESIS.md** | Open questions resolved + Round 2 validation results | ✅ Updated |
| **BUILD_PLAN.md** | NFR phasing, RLS in Phase 0.2, tiered gate criteria | ✅ Updated |
| **NFR.md** | Tiered gate criteria, phasing labels | ✅ Updated |
| **ADR_LOG.md** | ADR-006 clarification (frameworks vs libraries) | Pending |
| **ARCHITECTURE_SPEC.md** | Housekeeping pass to reflect review changes | Deferred (not a build document) |

---

*This synthesis incorporates feedback from three independent architecture reviews across two rounds. All open questions are resolved. Both Round 2 reviewers recommend proceeding to build. Third reviewer feedback pending.*
