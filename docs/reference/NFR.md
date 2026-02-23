# Project Nova — Non-Functional Requirements (NFR)

**Version:** 1.0  
**Date:** February 2026  
**Status:** Draft — targets based on mid-market ERP workload assumptions  
**Review cycle:** Revisit after Phase 0 stress tests; adjust based on profiling data

---

## 1. Workload Assumptions

These NFRs target a mid-market ERP deployment. Targets will be re-calibrated as real usage data emerges.

```yaml
reference_deployment:
  tenants: 1 (single-tenant or SaaS with single active tenant)
  legal_entities: 2-20
  concurrent_users: 50-500
  concurrent_agent_sessions: 10-50
  daily_transaction_volume: 10,000 - 100,000 events
  peak_events_per_second: 500 - 5,000
  historical_event_volume: up to 100M events (5+ years of operation)
  projection_count: 50-200 distinct projection types
  active_rules: 500-5,000 configured rules
```

---

## 2. Performance Requirements

### 2.1 Event Store

| Metric | Target | Measurement |
|--------|--------|-------------|
| Event append latency | < 10ms p50, < 25ms p99 | Time from intent execute to event durably written |
| Event append throughput | > 2,000 events/second per legal entity partition | Sustained throughput under load test |
| Event read (single stream) | < 5ms for latest 100 events | Read by stream_id, ordered by sequence |
| Event read (partition scan) | < 100ms for 10,000 events by time range | Range query on single legal entity partition |
| Idempotency check | < 2ms | Lookup of idempotency key (index scan) |
| Concurrency conflict detection | < 1ms overhead | Version check on append (single row lookup) |

### 2.2 Projection Engine

| Metric | Target | Measurement |
|--------|--------|-------------|
| Projection update lag | < 500ms p50, < 1s p99 | Time from event append to projection reflecting the event |
| Projection query (simple lookup) | < 10ms | Single entity, indexed lookup |
| Projection query (list with filter) | < 50ms for 1,000 rows | Filtered list with RLS applied |
| Projection query (aggregation) | < 200ms | Trial balance for single legal entity, single period |
| Projection rebuild (1M events) | < 10 minutes | Full rebuild of a single projection type from event replay |
| Projection rebuild (10M events) | < 90 minutes | Full rebuild from event replay (parallelized across partition keys) |
| Snapshot creation | < 30 seconds per projection partition | Point-in-time snapshot for archival support |
| Snapshot invalidation detection | < 100ms | Identify affected snapshots after back-dated event |

### 2.3 Intent Protocol

| Metric | Target | Measurement |
|--------|--------|-------------|
| Simple intent (no approval) | < 100ms end-to-end | Submit → validate → execute → event appended |
| Intent with rule evaluation | < 200ms end-to-end | Submit → authenticate → authorize → validate (rules) → execute |
| Intent with approval routing | < 500ms to queued state | Submit → validate → route to approval queue |
| Concurrent intent throughput | > 500 intents/second | Sustained, with < 5% concurrency conflict rate |

### 2.4 Rules Engine

| Metric | Target | Measurement |
|--------|--------|-------------|
| Single rule evaluation | < 1ms | One rule evaluated against one event context |
| Rule set evaluation (per event) | < 20ms for up to 50 applicable rules | All matching rules evaluated with trace generation |
| Rule set evaluation (complex) | < 100ms for chained evaluation with up to 10 depth | Rules that trigger further rule evaluation |
| Trace generation overhead | < 20% of evaluation time | Cost of producing audit trace vs evaluation without trace |

### 2.5 Entity Graph

| Metric | Target | Measurement |
|--------|--------|-------------|
| Entity lookup (by ID) | < 5ms | Single entity with attributes |
| Entity lookup (by natural key) | < 10ms | Index scan on business key fields |
| Relationship traversal (1-hop) | < 10ms | Entity + immediate relationships |
| Hierarchy walk (up to 10 levels) | < 50ms | Recursive CTE for organizational or BOM hierarchy |
| Entity search (filtered list) | < 50ms for 1,000 results | Search with attribute filters |

### 2.6 AI/LLM Integration

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tier 1 intent parsing (deterministic) | < 5ms | Structured input → intent mapping |
| Tier 2 intent parsing (lightweight model) | < 50ms | Semi-structured input → classified intent |
| Tier 3 intent parsing (frontier LLM) | < 5 seconds | Unstructured input → reasoned intent |
| LLM fallback activation | < 100ms | Time to detect LLM unavailability and route to fallback |

---

## 3. Reliability & Availability

### 3.1 Availability Targets

| Component | Target | Notes |
|-----------|--------|-------|
| Event store (writes) | 99.9% (< 8.7 hours downtime/year) | Single PostgreSQL with streaming replication |
| Projection queries (reads) | 99.9% | Read replicas can serve during primary maintenance |
| Intent protocol | 99.9% | Stateless workers, horizontally scalable |
| AI/LLM integration | 99.0% (with graceful degradation) | External dependency; system functional without it (Tier 1/2 unaffected) |

### 3.2 Durability

| Requirement | Target |
|-------------|--------|
| Event durability | Zero data loss after acknowledged append (synchronous WAL write + streaming replication) |
| RPO (Recovery Point Objective) | 0 seconds for events (synchronous replication); < 1 second for projections (derived from events, rebuildable) |
| RTO (Recovery Point Objective) | < 15 minutes for full service restoration from replica promotion |

### 3.3 Failure Modes

```yaml
failure_handling:
  database_primary_failure:
    detection: < 10 seconds (streaming replication health check)
    response: automatic failover to synchronous replica
    data_loss: zero (synchronous replication)
    rto: < 30 seconds (automatic) or < 15 minutes (manual)
    
  projection_worker_failure:
    detection: < 30 seconds (health check interval)
    response: restart worker; resume from last cursor position
    data_loss: zero (at-least-once delivery, idempotent handlers)
    catch_up: automatic from cursor position
    
  ai_service_failure:
    detection: < 5 seconds (request timeout)
    response: activate degradation mode (Tier 1/2 unaffected, Tier 3 queued or routed to human)
    data_loss: zero (intents queued, not dropped)
    
  network_partition:
    between_app_and_db: intent processing pauses; resumes on reconnection
    between_projection_workers_and_db: workers pause; resume from cursor on reconnection
    data_loss: zero (all state in PostgreSQL)
```

---

## 4. Scalability

### 4.1 Scaling Dimensions

| Dimension | Day-One Capacity | Scale-Up Path |
|-----------|-----------------|---------------|
| Events per second (sustained) | 2,000 per legal entity partition | Add partitions; if >50K total, evaluate dedicated event transport |
| Concurrent users | 500 | Horizontal scaling of API workers |
| Concurrent agent sessions | 50 | Horizontal scaling of agent workers; rate limiting per agent |
| Legal entities | 20 | Structural partitioning handles up to ~100; beyond that, evaluate multi-instance |
| Projection types | 200 | Each projection is an independent consumer; add workers as needed |
| Historical events | 100M | Archival with snapshot-before-archive rule; cold storage for events beyond retention |
| Rules count | 5,000 | Rules indexed and cached; evaluation is per-applicable-set, not all rules |

### 4.2 Horizontal Scaling Model

```yaml
scaling_model:
  stateless_components:
    api_workers: scale horizontally (load balancer, any number of instances)
    intent_processors: scale horizontally (partition assignment via consistent hashing)
    projection_workers: scale horizontally (partition key ranges assigned per worker)
    agent_workers: scale horizontally (one worker per active agent session)
    
  stateful_components:
    postgresql_primary: vertical scaling (CPU, RAM, IOPS) + read replicas
    postgresql_replicas: horizontal scaling for read workloads
    kms: external managed service (scales independently)
    
  bottleneck_analysis:
    primary_bottleneck: PostgreSQL write throughput (event appends)
    secondary_bottleneck: projection processing throughput for hot partition keys
    mitigation: granular partition keys distribute load; scale-up triggers documented in ADR-002
```

---

## 5. Security Requirements

### 5.1 Authentication & Authorization

| Requirement | Specification |
|-------------|--------------|
| Authentication | OAuth 2.0 / OIDC with external identity provider |
| Session management | JWT tokens with configurable TTL (default 1 hour) |
| Authorization model | Capability-based (not role-based); duties assigned to identities; capabilities derived from duties |
| Agent authentication | System-issued credentials with capability boundaries; same authorization pipeline as humans |
| API authentication | API keys or OAuth client credentials; rate limited per key |

### 5.2 Data Protection

| Requirement | Specification |
|-------------|--------------|
| Encryption at rest | AES-256 for database volumes; PII fields additionally encrypted per data subject (crypto-shredding) |
| Encryption in transit | TLS 1.3 for all connections (client→API, API→DB, worker→DB) |
| PII handling | Crypto-shredding with per-subject keys; field-level classification per event type |
| Key management | Dedicated KMS, separate from event store; key rotation supported |
| Secret management | External secrets manager; no secrets in code, config files, or environment variables |

### 5.3 Isolation

| Boundary | Isolation Method |
|----------|-----------------|
| Tenant | Structural (separate partitions, encryption keys, backups) |
| Legal entity | Structural (separate event and projection partitions) |
| Division / Department / Site | Row-Level Security (PostgreSQL RLS policies) |
| Field-level (role-based) | Query-layer field masking |

---

## 6. Compliance & Audit

### 6.1 Audit Trail

| Requirement | Specification |
|-------------|--------------|
| Completeness | Every state change has a corresponding immutable event with actor, timestamp, and causality |
| Tamper evidence | Event sequence numbers are monotonic; gaps are detectable |
| Retention | Configurable per legal entity and jurisdiction (default 7 years for financial events) |
| Rule evaluation traces | Every rule evaluation produces a trace showing conditions checked, values used, and outcome |
| Agent reasoning traces | Agent reasoning logged alongside system authorization decision; divergences flagged |

### 6.2 Regulatory Targets

| Regulation | Coverage |
|------------|----------|
| SOX (Sarbanes-Oxley) | Immutable audit trail, SoD enforcement, continuous controls monitoring |
| GDPR (General Data Protection) | Crypto-shredding for right to erasure, consent-based processing, data subject access via projection |
| IFRS 15 (Revenue Recognition) | Event-sourced temporal state; "what was the state at recognition date" answerable by replay |
| Local tax compliance | Versioned rules per jurisdiction; localization packs with jurisdiction-specific logic |

---

## 7. Operational Requirements

### 7.1 Observability

| Requirement | Specification |
|-------------|--------------|
| Structured logging | JSON structured logs with correlation_id, intent_id, legal_entity context |
| Metrics | Prometheus-compatible metrics: event throughput, projection lag, intent latency, rule evaluation time, error rates |
| Tracing | OpenTelemetry distributed tracing across intent pipeline stages |
| Alerting | Configurable alerts on: projection lag > threshold, error rate spike, event store disk usage, KMS availability |
| Health checks | /health endpoint per service; readiness and liveness probes for orchestrator |

### 7.2 Backup & Recovery

| Requirement | Specification |
|-------------|--------------|
| Database backup | Continuous WAL archival + daily base backup |
| Point-in-time recovery | To any second within backup retention window |
| Backup retention | 30 days minimum (configurable) |
| Recovery testing | Automated monthly recovery test to verify backup integrity |
| KMS backup | Separate backup strategy; keys recoverable independently of event store |

### 7.3 Deployment

| Requirement | Specification |
|-------------|--------------|
| Deployment model | Containerized (Docker); orchestrated via Kubernetes or similar |
| Zero-downtime deployment | Rolling updates for stateless components; blue-green for database migrations |
| Configuration management | Environment-specific configuration via environment variables or config service; no hardcoded values |
| Database migrations | Forward-only migrations; tested in staging before production; rollback via compensating migration |

---

## 8. Development & Testing Requirements

### 8.1 Code Quality

| Requirement | Specification |
|-------------|--------------|
| Type safety | TypeScript strict mode; no `any` types in core engine |
| Test coverage | > 80% line coverage for core engine; > 90% for financial projections and rules engine |
| Integration tests | Full pipeline tests (intent → event → projection → query) for every business scenario |
| Load tests | Automated load test suite matching Phase 0 exit gate criteria |
| Security tests | Automated RLS enforcement tests for every projection; penetration testing before production |

### 8.2 Phase 0 Exit Gate (Stress Test Criteria)

These are the requirements before proceeding from Phase 0 (Foundation Engine) to Phase 1 (Governance). Gate tests **architectural soundness**, not hardware-dependent raw numbers.

```yaml
phase_0_exit_gate:
  # TIER 1: Pass-Minimum (REQUIRED — architecture must be sound)
  pass_minimum:
    linear_scaling: "Throughput scales linearly with partition count"
    no_unbounded_lag: "Projection lag stable under sustained load (no growing backlog)"
    no_lock_contention: "No escalating lock waits under concurrent load"
    no_memory_leaks: "Stable memory under 1-hour sustained load"
    correctness: "Zero data loss, zero lost updates, trial balance reconciles"
    note: "If on limited hardware, Pass-Minimum is sufficient to proceed"

  # TIER 2: Pass-Target (EXPECTED on reasonable hardware)
  pass_target:
    event_append: "> 2,000 events/second per partition (sustained 5 minutes)"
    concurrent_intents: "> 50 concurrent intents resolving correctly"
    projection_lag_p99: "< 1 second under sustained load"
    intent_end_to_end_p50: "< 100ms (simple intent, no approval)"
    projection_rebuild_time: "1M events in < 10 minutes"
    snapshot_creation: "< 30 seconds per projection partition"
    idempotency: "duplicate intent returns original result, not double-posting"
    back_dated_event: "post to prior period, verify snapshot invalidation"
    schema_migration: "event version change, rebuild projection, verify correctness"
    reconciliation: "trial balance = sum of all posted events (zero variance)"
    
  # TIER 3: Pass-Stretch (ASPIRATIONAL — confirms headroom)
  pass_stretch:
    event_append: "> 5,000 events/second per partition"
    projection_lag_p99: "< 200ms under sustained load"
    projection_rebuild_time: "1M events in < 5 minutes"

  test_methodology:
    generator: synthetic event generator producing realistic AP/GL event streams
    harness: load test harness with concurrent intent submission
    verification: automated reconciliation (trial balance after load = sum of all posted events)
```

### 8.3 NFR Phasing — What Must Be Proven When

Not all NFRs need full depth in Phase 0. Each is labeled by when it must be operational:

```yaml
nfr_phasing:
  phase_0_prove_mechanism:
    - structured JSON logging with correlation_id (covers intent pipeline)
    - one OpenTelemetry trace through full pipeline
    - basic /health endpoint per service component
    - RLS policy on one projection table (proves pattern)
    - idempotency enforcement (proves mechanism)
    - one load test demonstrating linear scaling
    - PII encryption on event write (may use local key store, not full KMS)
    
  phase_1_harden:
    - full Prometheus metric catalog
    - alerting on projection lag, error rates, disk usage
    - RLS on ALL projection tables with automated tests
    - crypto-shredding with production KMS
    - OAuth/OIDC with external identity provider
    
  phase_2_production_ready:
    - full observability stack (metrics + traces + logs + dashboards)
    - blue/green projection rebuilds
    - automated backup verification
    - penetration testing
    - disaster recovery runbook and tested procedure
```

---

## 9. Capacity Planning Reference

### 9.1 Storage Estimates

```yaml
storage_estimates:
  event_size_average: 500 bytes (JSON payload + metadata)
  
  daily_storage:
    low_volume: "10K events × 500B = ~5 MB/day"
    mid_volume: "100K events × 500B = ~50 MB/day"
    high_volume: "1M events × 500B = ~500 MB/day"
    
  annual_storage:
    low_volume: "~2 GB/year events + ~1 GB projections"
    mid_volume: "~18 GB/year events + ~5 GB projections"
    high_volume: "~180 GB/year events + ~30 GB projections"
    
  5_year_projection:
    mid_volume: "~90 GB events + ~25 GB projections (before archival)"
    with_archival: "~25 GB online events + ~65 GB cold storage + ~25 GB projections"
    
  postgresql_comfortable_range:
    single_instance: "up to ~500 GB total data with proper indexing and partitioning"
    beyond: "evaluate read replicas, partitioning strategy, or dedicated analytics store"
```

### 9.2 Connection Pool Estimates

```yaml
connection_pool:
  api_workers: "2 connections per worker × N workers"
  projection_workers: "1 connection per worker × M workers"
  agent_workers: "1 connection per active session × K sessions"
  
  mid_deployment:
    api_workers: 10 workers × 2 = 20 connections
    projection_workers: 10 workers × 1 = 10 connections
    agent_workers: 10 sessions × 1 = 10 connections
    admin_reserved: 5 connections
    total: ~45 connections (well within PostgreSQL default 100)
    
  scaling_note: "PgBouncer or similar connection pooler when total exceeds 100"
```

---

## 10. NFR Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02 | Initial draft based on architecture review synthesis |

*Targets will be recalibrated after Phase 0 stress tests with real profiling data. Conservative estimates preferred — it's better to discover headroom than to discover a wall.*
