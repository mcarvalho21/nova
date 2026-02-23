# Project Nova — Architecture Decision Records

**Purpose:** Record every significant architectural decision with context, alternatives considered, and rationale. Decisions are immutable once recorded — superseded decisions are marked as such with a link to the replacement, never deleted.

**Format:** Each ADR follows: Status → Context → Decision → Rationale → Alternatives Considered → Consequences

---

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| ADR-001 | [Event Sourcing as System of Record](#adr-001-event-sourcing-as-system-of-record) | Accepted | 2026-02 |
| ADR-002 | [PostgreSQL for All Storage (Day One)](#adr-002-postgresql-for-all-storage-day-one) | Accepted | 2026-02 |
| ADR-003 | [Structural Isolation for Legal Entities, RLS for Organizational Dimensions](#adr-003-structural-isolation-for-legal-entities-rls-for-organizational-dimensions) | Accepted | 2026-02 |
| ADR-004 | [Crypto-Shredding for PII Deletion](#adr-004-crypto-shredding-for-pii-deletion) | Accepted | 2026-02 |
| ADR-005 | [TypeScript End-to-End for MVP](#adr-005-typescript-end-to-end-for-mvp) | Accepted | 2026-02 |
| ADR-006 | [Build Core Engine Components, Not Adopt Frameworks](#adr-006-build-core-engine-components-not-adopt-frameworks) | Accepted | 2026-02 |
| ADR-007 | [Intent Protocol as Universal Interaction Pattern](#adr-007-intent-protocol-as-universal-interaction-pattern) | Accepted | 2026-02 |
| ADR-008 | [Events Table as Outbox with LISTEN/NOTIFY Wakeup](#adr-008-events-table-as-outbox-with-listennotify-wakeup) | Accepted | 2026-02 |
| ADR-009 | [Optimistic Concurrency Control for Entity Mutations](#adr-009-optimistic-concurrency-control-for-entity-mutations) | Accepted | 2026-02 |
| ADR-010 | [Three Consistency Levels for Read Operations](#adr-010-three-consistency-levels-for-read-operations) | Accepted | 2026-02 |
| ADR-011 | [Upcasting on Read, Never Copy-and-Transform](#adr-011-upcasting-on-read-never-copy-and-transform) | Accepted | 2026-02 |
| ADR-012 | [LLM as Planner, System as Authority](#adr-012-llm-as-planner-system-as-authority) | Accepted | 2026-02 |
| ADR-013 | [Tiered AI Routing (Deterministic / Lightweight / Reasoning)](#adr-013-tiered-ai-routing) | Accepted | 2026-02 |
| ADR-014 | [External Protocols as Adapters, Not Native Core](#adr-014-external-protocols-as-adapters-not-native-core) | Accepted | 2026-02 |
| ADR-015 | [Time Fences for Continuous Planning Governance](#adr-015-time-fences-for-continuous-planning-governance) | Accepted | 2026-02 |
| ADR-016 | [Walking Skeleton Development Approach](#adr-016-walking-skeleton-development-approach) | Accepted | 2026-02 |
| ADR-017 | [Partition-Level Parallelism for Projections](#adr-017-partition-level-parallelism-for-projections) | Accepted | 2026-02 |
| ADR-018 | [Snapshot-Before-Archive Rule](#adr-018-snapshot-before-archive-rule) | Accepted | 2026-02 |

---

## ADR-001: Event Sourcing as System of Record

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Core Architecture

### Context

Traditional ERP systems use mutable relational tables as the system of record. Updates overwrite previous state, making it impossible to answer "what was the state at time T?" or "why did this value change?" without complex audit trails bolted on after the fact. This creates problems for compliance (SOX, IFRS), debugging, and any kind of temporal analysis.

### Decision

The event store is the single source of truth. All state changes are represented as immutable, append-only events. Current state is derived by replaying events through projections. The event store never supports UPDATE or DELETE operations on event data. Corrections are made by appending compensating events.

### Rationale

- **Complete audit trail by construction:** Every state change is permanently recorded with who, what, when, and why. No bolt-on audit tables needed.
- **Temporal queries are trivial:** "What was the GL balance on March 15?" = replay events up to March 15.
- **Debugging is deterministic:** Any system state can be reproduced by replaying events.
- **Projection flexibility:** New read models can be built from historical events without schema migration.
- **Regulatory compliance:** SOX, IFRS 15 revenue recognition, and GDPR right-to-explanation are natively supported.

### Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Traditional CRUD with audit tables | Audit trails are incomplete (trigger-based capture misses application-level context), temporal queries require complex query logic, new read models require ETL pipelines |
| Change Data Capture (CDC) on mutable tables | CDC captures what changed but not why. Business context (intent, approval chain, rule evaluation) is lost. |
| Hybrid (mutable tables + event log) | Two sources of truth creates consistency problems. Which one is authoritative when they diverge? |

### Consequences

- **Positive:** Complete audit trail, temporal queries, flexible projections, deterministic replay.
- **Negative:** Event store grows indefinitely (mitigated by archival with snapshot-before-archive rule, ADR-018). Projection rebuilds can be slow for large event volumes (mitigated by snapshots and granular partition keys, ADR-017). Schema evolution requires upcasting discipline (ADR-011).

---

## ADR-002: PostgreSQL for All Storage (Day One)

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Technology Stack

### Context

The system has three distinct storage workloads: append-only event writes (sequential I/O), entity graph with relationships (random reads, JSONB queries), and projection tables (mixed read/write, aggregation-heavy). Each workload has a different optimal storage engine.

### Decision

Use PostgreSQL for all three workloads at MVP. The event store uses append-only tables with partitioning. The entity graph uses relational tables with JSONB for flexible attributes. Projections use relational tables with appropriate indexing and partitioning. Polyglot persistence is a documented scale-up path, not a day-one requirement.

### Rationale

- **Operational simplicity:** One database to deploy, backup, monitor, and tune. One set of connection pools, one failure mode to handle.
- **Developer velocity:** One query language, one set of tools, one mental model. No serialization boundaries between storage engines.
- **PostgreSQL is remarkably capable:** Partitioned append-only tables handle event store workloads well into millions of events per partition. JSONB with GIN indexes supports entity graph queries efficiently. Partitioned and indexed relational tables handle financial aggregations at ERP scale.
- **The bottleneck isn't storage yet:** At MVP scale (tens of companies, hundreds of users, thousands of events per second), PostgreSQL handles all workloads comfortably.

### Scale-Up Triggers

| Trigger | Response |
|---------|----------|
| Event append throughput exceeds PostgreSQL's comfortable range (>50K events/second sustained) | Evaluate EventStoreDB or Kafka for event transport |
| Analytical queries on billions of rows become too slow | Add ClickHouse or DuckDB as OLAP layer synced from projections |
| Full-text search or faceted search needed at scale | Add Elasticsearch synced from projections |
| High-volume telemetry (IoT/agent activity) | Add TimescaleDB for time-series data |

### Alternatives Considered

| Alternative | Why Rejected (for Day One) |
|------------|---------------------------|
| EventStoreDB for events | Purpose-built but adds operational dependency, different query model, smaller ecosystem. Crossover point where specialization outweighs PostgreSQL's generality is higher than commonly assumed. |
| Neo4j for entity graph | Our "entity graph" is a logical concept with bounded traversal (1-3 hops typical). PostgreSQL recursive CTEs handle this. Neo4j adds a whole graph database to operate for a feature set we can model relationally. |
| Kafka for event transport | Kafka is a transport layer, not a system of record. Events need SQL-queryable storage for ad-hoc analysis. Kafka could supplement PostgreSQL for inter-service messaging at scale, but doesn't replace it. |
| Multi-database from day one | Doubles operational complexity and introduces distributed transaction problems at a stage where the primary risk is getting abstractions right, not handling scale. |

### Consequences

- **Positive:** Fast iteration, simple deployment, single operational surface.
- **Negative:** Will eventually hit performance ceiling on specific workloads. Mitigation: documented scale-up triggers and upgrade paths above. Architecture is designed so storage engines can be swapped behind stable interfaces.

---

## ADR-003: Structural Isolation for Legal Entities, RLS for Organizational Dimensions

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Security Architecture

### Context

Multi-entity ERP systems must prevent data leakage across organizational boundaries. The traditional approach (`WHERE tenant_id = X` query filters) is fragile — a single missing filter exposes data across boundaries. Full structural isolation (separate tables/partitions per scope) is safer but more expensive. The question is: which boundaries get structural isolation and which get row-level filtering?

### Decision

Three-tier isolation model:
1. **Structural isolation** (physically separate partitions) for: `tenant_id` and `legal_entity`
2. **Row-Level Security** (PostgreSQL RLS policies) for: `division`, `department`, `site`, `region`, `cost_center`
3. **Field-level masking** (query-layer attribute filtering) for: role-based attribute visibility

### Rationale

- **Legal entities are hard legal boundaries.** Financial statements, tax filings, and regulatory reporting are per legal entity. Cross-entity data leakage has legal consequences. Structural isolation eliminates an entire class of authorization bugs.
- **Organizational dimensions are soft boundaries.** A division and a department exist within the same legal entity, same consolidation, same audit. Row-level security provides appropriate access control without the storage and operational overhead of structural partitioning.
- **Over-partitioning is operationally expensive.** If we structurally partition by legal entity × division × department × site, a company with 5 entities, 10 divisions, 50 departments, and 20 sites would have 50,000 projection partitions. This is unmanageable. Row-level security scales to any number of organizational dimensions without multiplying partitions.

### Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Structural isolation for everything | Operationally unmanageable. Partition explosion with many dimensions. |
| RLS for everything (including legal entities) | One missing RLS policy on one projection table could leak financial data across legal entity boundaries. Structural isolation is the only guarantee. |
| Application-level filtering (no RLS, no partitioning) | Fragile. Relies on every query including the right WHERE clause. A single developer mistake exposes cross-entity data. |

### Consequences

- **Positive:** Strong legal entity isolation without operational partition explosion. Organizational access control scales to any number of dimensions.
- **Negative:** RLS policies must be maintained and tested for every projection table. New projections must include RLS policy as part of their definition. Mitigation: automated RLS policy generation from projection metadata; test suite verifying RLS enforcement.

---

## ADR-004: Crypto-Shredding for PII Deletion

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Privacy & Compliance

### Context

Event sourcing creates an immutable log. GDPR Article 17 (right to erasure) requires the ability to delete personal data. Field-level redaction (overwriting PII fields with "[REDACTED]") was the initial approach but has a flaw: plaintext PII may persist in PostgreSQL WAL files, backup snapshots, replica streams, and OS-level page cache even after the redaction UPDATE.

### Decision

Crypto-shredding is the primary PII deletion mechanism. Every data subject gets a unique encryption key stored in a separate KMS. PII fields are encrypted with the subject's key before event append. Non-PII fields remain plaintext for querying. On deletion request, the key is destroyed, rendering encrypted fields permanently unreadable. Event skeleton (timestamps, causality, non-PII metadata) is preserved.

### Rationale

- **Physical deletion without modifying immutable events.** Destroying the key achieves the same result as deleting the data — the plaintext is irrecoverable — without violating event immutability.
- **Works across all storage layers.** WAL files, backups, replicas — all contain only encrypted PII. Key destruction makes all copies unreadable simultaneously.
- **Per-subject granularity.** Deleting one customer's data doesn't affect any other data.
- **Key rotation supported.** Re-encrypt with new key on rotation schedule without modifying events.

### Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Field-level SQL redaction | Doesn't guarantee physical deletion from WAL, backups, page cache. May not satisfy strict GDPR interpretations. |
| Delete entire events | Violates event store immutability. Breaks causality chains and audit trail. |
| Separate PII store (events reference PII by ID) | Adds architectural complexity (two stores to coordinate). Query patterns become complex (JOIN across stores for display). Availability coupling. |

### Consequences

- **Positive:** GDPR-compliant deletion without compromising immutability or audit trail.
- **Negative:** Encryption on every write adds latency (~1-2ms for AES-256-GCM). KMS is a critical dependency (mitigated by caching decryption keys with TTL). Projection rebuilds must handle "[REDACTED]" for deleted subjects. Mitigation: PII manifest per event type automates classification; targeted projection rebuild on key destruction.

---

## ADR-005: TypeScript End-to-End for MVP

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Technology Stack

### Context

The system has workloads ranging from API serving (I/O-bound, Node.js strength) to projection computation (potentially CPU-bound). Three reviewers recommended considering Rust, Go, or C# for the core computation engine to avoid Node.js single-threaded limitations.

### Decision

TypeScript/Node.js for the entire system at MVP. API layer, core engine (rules, projections, graph), and interface layer all in TypeScript. Worker threads for CPU-bound computation if needed.

### Rationale

- **Developer velocity is the primary constraint at MVP.** The risk is getting abstractions wrong, not runtime performance. One language means one build system, one deployment pipeline, one mental model, faster iteration.
- **ERP projection workloads are I/O-bound.** The typical projection computation is: read event from database, apply transformation, write result to database. The bottleneck is database I/O, not CPU. "Heavy math" in ERP (BOM explosions, cost rollups, tax calculations) operates on datasets of hundreds to thousands of items — well within single-core JavaScript performance.
- **Node.js with worker threads handles CPU-bound work** for the target scale. Thousands of events per second with projection processing is achievable without multi-language complexity.
- **Multi-language codebases have compound costs.** Two languages means: two build toolchains, two package ecosystems, two deployment pipelines, two sets of debugging tools, serialization boundaries between languages, and twice the hiring requirements for a small team.

### Scale-Up Triggers

If profiling data from production workloads shows specific CPU bottlenecks:
1. Profile first — identify the actual hot path
2. Optimize TypeScript (algorithm improvements, streaming, worker threads)
3. If still insufficient: extract the specific hot-path computation to a Rust/Go service
4. Keep TypeScript for orchestration, API, business logic, and all non-hot-path code

### Alternatives Considered

| Alternative | Why Rejected (for MVP) |
|------------|----------------------|
| Rust for core engine, TypeScript for API | Doubles development complexity for speculative performance gains. Will consider when profiling data justifies it. |
| Go for core engine | Same complexity concern. Go's concurrency model is elegant but doesn't justify two-language overhead at MVP scale. |
| C#/.NET for everything | Viable choice but the team's expertise is TypeScript-centered. Language choice should align with team strength. |
| Java/Kotlin with Spring Boot | Heavier runtime, slower iteration cycles. JVM warm-up times affect development velocity. |

### Consequences

- **Positive:** Fastest time to working software. Single mental model. Easy hiring.
- **Negative:** Will eventually hit CPU bottleneck on specific workloads (estimated: >10,000 events/second sustained with complex projection logic). Mitigation: documented scale-up triggers; architecture designed with clean interfaces so computation services can be swapped without rewiring.

---

## ADR-006: Build Core Engine Components, Not Adopt Frameworks

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Build vs. Buy

### Context

Existing CQRS/event sourcing frameworks (Axon, Marten, EventStoreDB client libraries, NestJS CQRS module) and rules engines (Drools, Zen-Engine, json-rules-engine) provide pre-built implementations of patterns we need. Using them would reduce initial development time.

### Decision

Build focused, purpose-built engine components rather than adopting existing frameworks. Use libraries (PostgreSQL client, HTTP framework, JSON schema validation) but not opinionated frameworks that impose their own architectural patterns.

### Rationale

- **Frameworks embed opinions that conflict with our architecture.** Axon assumes aggregate roots, command handlers, and saga patterns from traditional DDD. Our entity graph isn't a traditional aggregate root. Our rules engine isn't a command handler. Our intent protocol isn't a saga. Adapting our model to a framework's assumptions requires constant workaround code.
- **Our rules engine has unique requirements.** It must evaluate conditions against events, entities, projections, and financial dimensions simultaneously. It must produce evaluation traces for audit. It must support effective-dated rule versions. No existing rules engine natively supports this combination.
- **Framework overhead compounds over time.** Day-one velocity gain from a framework becomes day-365 velocity loss from fighting the framework's assumptions, working around its limitations, waiting for upstream fixes, and explaining its quirks to new developers.
- **Our components are not general-purpose.** We're building a focused event store (not a generic event bus), a focused rules evaluator (not a general BRE), a focused projection engine (not a generic CQRS framework). The focused version is smaller and simpler than adapting a general-purpose framework.

### Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Axon Framework | Assumes aggregate root pattern. Heavy Java ecosystem. Imposes saga coordinator pattern that conflicts with our intent protocol. |
| Marten (.NET) | Good event sourcing library but .NET ecosystem, aggregate root assumption. |
| NestJS CQRS module | Lightweight but opinionated about command/query separation in a way that doesn't match our intent protocol model. |
| Zen-Engine (Rust rules engine) | Good evaluator but own condition language, no event store integration, no audit trace generation, no effective-dated rule versioning. |

### Consequences

- **Positive:** Complete control over engine behavior. No framework-imposed constraints. Clean, focused implementations.
- **Negative:** More initial development effort. No community support for engine internals (we are the community). Must build our own testing utilities. Mitigation: each component is small and focused; the walking skeleton approach (ADR-016) validates integration early.

---

## ADR-007: Intent Protocol as Universal Interaction Pattern

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Core Architecture

### Context

ERP systems receive commands from many sources: UI form submissions, API calls, batch imports, system-generated actions, and AI agent decisions. Traditional ERPs route these through different code paths (UI controller, API handler, batch processor, scheduled job), each with different validation, authorization, and audit patterns. This creates inconsistencies in security enforcement and audit coverage.

### Decision

All state-changing interactions flow through a single Intent Protocol pipeline: Receive → Authenticate → Authorize → Validate → Plan → Approve → Execute. Humans, API clients, system events, and AI agents all submit intents through the same pipeline. No alternative paths exist for mutating system state.

### Rationale

- **Consistent security enforcement.** Every mutation passes through the same authorization and validation steps regardless of origin.
- **Consistent audit trail.** Every mutation is traceable through the same pipeline stages.
- **Agent governance for free.** AI agents submit intents just like humans. The same rules, approvals, and boundaries apply. No separate "agent governance" layer needed.
- **Simplifies the codebase.** One pipeline to build, test, and maintain instead of N parallel paths.

### Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Separate API/UI/Agent handlers with shared validation library | "Shared library" invariably drifts across implementations. Eventually someone forgets to call the validation function in one handler. |
| Command pattern (CQRS commands) | Similar intent but typically lacks the multi-stage pipeline (plan, approve). Commands are typically validate-then-execute with no approval stage. |
| Service layer with transaction scripts | Traditional but doesn't provide the intent metadata (who, why, approval chain) needed for audit and agent governance. |

### Consequences

- **Positive:** Uniform security, audit, and governance. Simpler mental model. Agent integration is natural.
- **Negative:** All interactions pay the overhead of the full pipeline (even simple ones). Mitigation: pipeline stages are skipped when not applicable (e.g., system events skip authentication; low-risk intents skip approval). The overhead of a no-op stage is negligible.

---

## ADR-008: Events Table as Outbox with LISTEN/NOTIFY Wakeup

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Infrastructure

### Context

After an event is appended to the event store, subscribers (projection engines, notification services, agents) need to be notified. The standard distributed systems patterns are: polling, message bus, or transactional outbox. Each has tradeoffs in latency, reliability, and complexity.

### Decision

The events table IS the outbox. Subscribers pull from their cursor position in the events table. PostgreSQL LISTEN/NOTIFY is used as a best-effort wakeup signal to reduce polling latency. If NOTIFY fails or is missed, subscribers fall back to polling on a 500ms interval.

### Rationale

- **No separate outbox table needed.** The events table is already an append-only, durable, ordered log. Adding a separate outbox duplicates this without benefit.
- **At-least-once delivery via cursors.** Subscribers track their position. They can only miss events temporarily (until next poll), never permanently. Cursor advance is atomic with event processing.
- **LISTEN/NOTIFY provides low-latency notification** without the operational overhead of a separate message broker. In the common case, subscribers are notified within milliseconds.
- **Graceful degradation.** If NOTIFY fails, the system continues working (slightly higher latency from polling). If a subscriber crashes, it resumes from its last cursor position.

### Alternatives Considered

| Alternative | Why Rejected (for Day One) |
|------------|---------------------------|
| Kafka/Redpanda as event bus | Adds a second infrastructure dependency with its own operational requirements (Zookeeper/KRaft, partitions, consumer groups). Justified at scale, not at MVP. |
| Redis Streams | Lighter than Kafka but still a second data store to operate. Would be the first upgrade target if LISTEN/NOTIFY proves insufficient. |
| Pure polling (no NOTIFY) | Works but adds 500ms average latency to all event delivery. NOTIFY is easy to add and nearly eliminates this. |
| Separate outbox table | Adds write amplification (every event written twice) and a cleanup job. The events table already IS an ordered, durable log. |

### Consequences

- **Positive:** Simple, no additional infrastructure, graceful degradation, low latency in happy path.
- **Negative:** LISTEN/NOTIFY doesn't support durable delivery, replay, or backpressure — but we don't rely on it for those (cursors provide durability, events table provides replay, subscriber pacing provides backpressure). Limited fan-out capability (many LISTEN connections is not ideal). Mitigation: documented upgrade path to Redis Streams or NATS when subscriber count or latency requirements exceed PostgreSQL's comfortable range.

---

## ADR-009: Optimistic Concurrency Control for Entity Mutations

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Core Engine

### Context

When multiple intents attempt to modify the same entity simultaneously (e.g., two agents adjusting the same inventory item, or a user and an agent both updating vendor details), the system must detect and resolve conflicts. Options: pessimistic locking (lock before read), optimistic concurrency (check version on write), or last-write-wins.

### Decision

Optimistic concurrency control using entity version numbers. Each intent reads the entity's current version, processes through the pipeline, and includes `expected_entity_version` when appending the resulting event. The event store rejects the append if the version has advanced since the read. The intent protocol retries from validation with fresh state (up to 3 retries with exponential backoff).

### Rationale

- **Higher throughput than pessimistic locking.** No locks held during the intent pipeline (which may include approval workflows spanning minutes or hours). Only the final append checks for conflicts.
- **Correct conflict detection.** If two intents modify the same entity, the second one to attempt append is guaranteed to see the conflict and retry with the first one's changes included.
- **Appropriate for ERP workloads.** Conflicts on the same entity are uncommon relative to total throughput. Optimistic control has low overhead for the common case (no conflict) and correct behavior for the uncommon case (conflict → retry).
- **Last-write-wins would lose data.** In financial systems, silently overwriting another user's changes is unacceptable.

### Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Pessimistic locking (SELECT FOR UPDATE) | Locks held during approval workflows would create severe contention. Long-held locks risk deadlocks and reduce throughput. |
| Last-write-wins | Loses data silently. Unacceptable for financial operations. |
| Application-level merge | Complex, error-prone, domain-specific merge logic for every entity type. Not justified when optimistic concurrency handles it cleanly. |

### Consequences

- **Positive:** High throughput, correct conflict detection, no long-held locks.
- **Negative:** Intents may fail and retry under high contention. Mitigation: 3 retries with exponential backoff. If contention is sustained, it indicates a process problem (too many actors modifying the same entity) that should be surfaced to operations.

---

## ADR-010: Three Consistency Levels for Read Operations

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Core Engine

### Context

CQRS architectures have an inherent read lag — projections update asynchronously after events are appended. For dashboards, this lag (typically <500ms) is invisible. For critical operations (payment execution, inventory allocation), reading stale data could cause incorrect decisions.

### Decision

Three consistency levels, configurable per intent type: **eventual** (read from projection, <500ms lag), **strong** (read from event store, zero lag), **verified** (plan from projection, verify against event store before execute).

### Rationale

- **Not all operations need the same guarantee.** A dashboard showing today's sales can lag by 500ms. A payment checking account balance cannot.
- **Strong consistency is achievable without compromising CQRS.** Critical operations read directly from the event store (computing current state from the event stream for a specific entity). This is a targeted, per-entity computation — not a full projection query.
- **Verified mode is optimal for high-value intents.** Planning uses the fast projection (good enough for initial validation and UI display). Final verification before execution uses the authoritative event store. This combines low-latency planning with correctness at the commit point.
- **Configuration per intent type** allows operators to tune the tradeoff per business requirement without code changes.

### Alternatives Considered

| Alternative | Why Rejected |
|------------|-------------|
| Synchronous projection updates for critical paths | Defeats CQRS purpose. Couples write path to projection performance. Creates write bottleneck. |
| All reads from event store (no projections for queries) | Too slow for query workloads. Projections exist specifically to pre-compute query results. |
| All reads eventual (accept the lag everywhere) | Unacceptable risk for financial operations. Even 100ms of stale data could mean allocating inventory that was just consumed. |

### Consequences

- **Positive:** Each operation gets the consistency level it needs. No blanket performance penalty. Dashboards stay fast. Critical operations stay correct.
- **Negative:** Developers must correctly assign consistency levels to intent types. Wrong assignment = stale reads on critical operations. Mitigation: sensible defaults (eventual for queries, strong for financial mutations); threshold-based auto-elevation for high-value intents.

---

## ADR-011: Upcasting on Read, Never Copy-and-Transform

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Core Engine

### Context

Over years of operation, event schemas will evolve. New fields are added, field structures change, event semantics evolve. Projections built for V3 schemas need to process V1 events. Two approaches: transform old events into new format (copy-and-transform), or transform on read during projection rebuild (upcasting).

### Decision

Event immutability is absolute. Old events are never modified, copied-and-transformed, or deleted. Schema evolution uses upcasting: migration functions transform old events into the current schema during projection rebuild, without modifying the stored events. Event type definitions include a `normalizeToLatest` function and `previous_versions` chain.

### Rationale

- **Immutability is a non-negotiable invariant.** The entire audit, compliance, and temporal query model depends on events being exactly as they were when originally recorded. Any modification — even "upgrading" the format — breaks this guarantee.
- **Copy-and-transform creates a new event store.** You're not migrating — you're creating a second version of history. Which one is authoritative? What happens to references (correlation IDs, causal links) that point to the original events?
- **Upcasting is deterministic and testable.** Migration functions are pure transforms. They can be unit tested with every old event version. They compose cleanly through version chains (V1 → V2 → V3).
- **The original data is always available.** If an upcasting function has a bug, fix the function and re-run. If copy-and-transform has a bug, the original data may already be deleted.

### Consequences

- **Positive:** Event store integrity preserved forever. Migration bugs are recoverable. Schema evolution is an application concern, not a storage concern.
- **Negative:** Projection rebuilds must process all event versions (slightly slower than processing uniform modern events). Upcasting functions accumulate over years. Mitigation: snapshot strategy reduces frequency of full replays; upcasting functions are small and composable.

---

## ADR-012: LLM as Planner, System as Authority

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Agent Architecture

### Context

AI agents in the system use LLMs (Claude, etc.) for reasoning about business operations. The LLM can parse natural language, identify anomalies, suggest actions, and plan multi-step operations. The question is: how much authority should the LLM have in the decision-making process?

### Decision

The LLM is a planner and suggester. It never has authority to authorize its own actions. All agent intents pass through the same intent protocol as human actions, with deterministic rules engine validation and capability-based authorization. A "Policy Gate" sits between planning and execution — it is deterministic code, not AI judgment.

### Rationale

- **LLMs are probabilistic, not deterministic.** Authorization decisions must be deterministic. A payment approval that depends on LLM mood is unacceptable.
- **LLMs can be manipulated.** Prompt injection, context manipulation, and adversarial inputs can cause LLMs to reason incorrectly. The policy gate catches these failures.
- **Audit requires deterministic decisions.** "The AI thought it should be approved" is not an acceptable audit trail. "Rule R-123 evaluated conditions C1-C5, all passed, authorization granted" is.
- **Same pipeline as humans.** If we trust the intent protocol to govern human actions, we should trust it to govern agent actions. No separate, less rigorous "agent authorization" path.

### Consequences

- **Positive:** Agent actions are auditable, deterministic, and bounded. LLM failures are caught by policy gate. Same compliance guarantees as human actions.
- **Negative:** Agents can't take actions that rules don't anticipate. If a novel situation requires judgment, the agent must escalate to a human or request a rule change. This is a feature, not a bug.

---

## ADR-013: Tiered AI Routing

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Agent Architecture

### Context

Routing all intents through a frontier LLM would cost ~$0.01-0.10 per intent at high throughput and add 1-3 seconds of latency. At ERP scale (thousands of intents per hour), this is unsustainable financially and unacceptable for user experience on routine operations.

### Decision

Three-tier routing: Tier 1 (deterministic, ~80% of intents) — structured inputs mapped directly to intents with no AI. Tier 2 (lightweight, ~15%) — semi-structured inputs processed by local small models. Tier 3 (reasoning, ~5%) — unstructured inputs processed by frontier LLM. Provider abstracted behind interface for swapping and degradation.

### Consequences

- **Positive:** 95% of intents process in <50ms at near-zero cost. LLM budget focused on high-value reasoning tasks. System degrades gracefully when LLM is unavailable.
- **Negative:** Must maintain routing logic to classify inputs into tiers. Some edge cases may be misrouted. Mitigation: conservative routing (when in doubt, route to higher tier).

---

## ADR-014: External Protocols as Adapters, Not Native Core

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Integration Architecture

### Context

The AI industry is developing standard agent protocols: MCP (Model Context Protocol) for tool/data access, ACP (Agent Communication Protocol) for coordination, Google's A2A for cross-enterprise communication. A reviewer recommended native adoption of these protocols.

### Decision

The intent protocol is the stable internal core. External protocols (MCP, ACP, A2A, and future standards) are supported via adapter layers that translate between external protocol semantics and internal intent protocol semantics.

### Rationale

- **Internal agents don't need protocol discovery.** They're purpose-built actors with direct typed access. MCP's tool discovery adds indirection with no value for internal operations.
- **Protocols evolve and get replaced.** Building the core around a specific external protocol creates migration risk when that protocol is superseded. The intent protocol is our stable abstraction.
- **Adapter layers are cheap to build.** Translating between protocol formats is straightforward. Building our core around someone else's protocol format is expensive to undo.

### Consequences

- **Positive:** Architecture outlives any specific protocol standard. Internal operations are fast and direct. External integration supported without compromise.
- **Negative:** Must build and maintain adapter layers for each external protocol we support. Mitigation: adapters are thin translation layers, not complex logic.

---

## ADR-015: Time Fences for Continuous Planning Governance

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Business Capabilities

### Context

Traditional ERPs run MRP in batch (nightly or weekly). Our architecture computes demand/supply variance in real-time. But real-time autonomous actioning of planning changes causes "system nervousness" — a one-day sales order delay could cascade into cancelling production orders, re-scheduling vendors, and flooding the shop floor with change notifications.

### Decision

Time fences govern when the system can autonomously act on planning changes. Frozen horizon (default 7 days): compute variance but don't modify orders. Firm horizon (default 14 days): adjust quantities but don't create/cancel orders. Planning horizon (default 90 days): full autonomous planning. Damping rules prevent thrashing from small variances.

### Consequences

- **Positive:** Real-time visibility into planning status without the operational chaos of real-time autonomous action. Planners see current state; system only acts autonomously where safe.
- **Negative:** More configuration complexity (fence parameters per item/site). Defaults must be carefully calibrated per industry. Mitigation: sensible defaults; configurable per coverage group.

---

## ADR-016: Walking Skeleton Development Approach

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Development Process

### Context

Phase 0 was originally planned as sequential component development: event store weeks 1-2, entity graph weeks 3-4, rules engine weeks 5-6. This defers integration validation to the end of the phase, which is where the highest risk lives.

### Decision

Restructure Phase 0 around a vertical slice. By end of Week 2, one intent flows through the complete pipeline (intent → rules → events → projection → query → audit trace). Weeks 3-4 deepen engine capabilities. Weeks 5-6 run the first business scenario (AP invoice lifecycle) as a stress test.

### Rationale

- **Integration risk is the primary risk.** The abstractions (events, entities, rules, projections, intents) must work together. Building each to completion independently defers the discovery of integration problems.
- **Walking skeleton validates assumptions early.** If the intent protocol doesn't compose cleanly with the rules engine, we want to know in week 2, not week 6.
- **Demonstrates value sooner.** A thin but complete pipeline is more useful for stakeholder feedback than a deep but isolated event store.

### Consequences

- **Positive:** Integration problems discovered early. Stakeholder demo possible by Week 2. Foundation validated before building breadth.
- **Negative:** Each component is initially shallow (minimal features). Must resist the urge to "finish" one component before moving to the next. Mitigation: the Phase 0 exit gate (stress tests) ensures sufficient depth before proceeding.

---

## ADR-017: Partition-Level Parallelism for Projections

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Core Engine

### Context

Financial projections (running bank balances, FIFO costing, serial number tracking) require strict linear event ordering. You cannot process Event 100 before Event 99 for the same bank account. This appears to conflict with horizontal scaling of projection workers.

### Decision

Projection workers scale horizontally by processing different partition key ranges concurrently. Within a single partition key, events are processed strictly in order. Partition keys are granular (e.g., `[legal_entity, account_code]` for trial balance, `[legal_entity, site, item_id]` for inventory). Consistent hashing routes events to assigned workers. Rebalancing follows Kafka consumer group model.

### Consequences

- **Positive:** True horizontal scaling — parallelism proportional to number of distinct partition keys (typically thousands). Strict ordering preserved where it matters.
- **Negative:** Partition keys must be correctly chosen per projection type. Hot partitions (one account with massive throughput) can't be split further. Mitigation: monitor partition processing lag; alert on hot partitions.

---

## ADR-018: Snapshot-Before-Archive Rule

**Status:** Accepted  
**Date:** 2026-02  
**Category:** Core Engine

### Context

Event stores grow indefinitely. Old events must eventually be archived to cold storage. But if an entity's current state depends on replaying those events (Entity Graph state is derived from events), archiving removes the ability to rebuild that entity.

### Decision

Events cannot be archived unless all dependent projections have valid snapshots covering the archived range. Current state is always computable from snapshot + remaining online events. Full history replay requires cold storage retrieval (higher latency, on-demand).

### Consequences

- **Positive:** Current system state always available without cold storage. Archival is safe and reversible.
- **Negative:** Snapshot creation must precede archival (adds a step). Snapshots consume storage (much less than full event replay though). Cold storage retrieval for historical queries adds latency. Mitigation: automated snapshot-and-archive pipeline; cold storage retrieval is rare (auditor investigation, legal discovery).

---

*New ADRs will be appended as architectural decisions are made. Superseded ADRs are marked with status "Superseded by ADR-XXX" — never deleted.*
