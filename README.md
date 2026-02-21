# Nova ERP

**An open-source ERP engine built from first principles, where AI agents are first-class participants — not bolt-on tools.**

Nova rethinks enterprise software for the age of autonomous systems. Instead of bolting AI onto a 1990s database architecture, Nova starts with an event-sourced, append-only core where every state change is an immutable fact. Humans, AI agents, robots, and IoT devices all interact through the same intent protocol, governed by the same rules, with the same audit trail.

---

## Why Nova?

Traditional ERPs were designed for humans entering data into forms. They store mutable rows in relational tables, bolt on audit trails as an afterthought, and treat AI as an external integration. This creates fundamental problems:

- **No reliable history.** Mutable tables overwrite previous state. "What was the inventory level on March 15?" requires complex audit reconstruction.
- **AI as second-class citizen.** AI tools access the system through the same APIs as external integrations, with no native concept of agent identity, trust levels, or autonomous operation boundaries.
- **Rigid schemas.** Adding a field or changing a business rule requires schema migrations, downtime, and careful coordination.
- **Audit gaps.** Trigger-based audit tables capture what changed but not why, who approved it, or what rules were evaluated.

Nova solves these by making different foundational choices:

| Traditional ERP | Nova |
|----------------|------|
| Mutable rows are the source of truth | Immutable events are the source of truth |
| Audit trails bolted on via triggers | Complete audit trail by construction |
| AI accesses system via external APIs | AI agents are native participants with identity and boundaries |
| Schema changes require migrations | Event schema evolves via upcasting; projections are rebuildable |
| Business rules embedded in application code | Declarative rules engine with versioning and evaluation tracing |
| One way to read data (query the tables) | Multiple projections from the same events, each optimized for its use case |

---

## Architecture at a Glance

Nova's core is five engine components that work together:

```
                    ┌─────────────────────────────────────┐
                    │          INTENT PROTOCOL             │
                    │  (receive → validate → plan →        │
                    │   approve → execute)                 │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │          RULES ENGINE                │
                    │  (validate conditions, enforce       │
                    │   policies, route approvals)         │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
   ┌──────────▼────────┐  ┌───────▼────────┐  ┌────────▼───────┐
   │   EVENT STORE      │  │  ENTITY GRAPH  │  │  PROJECTION    │
   │  (append-only      │  │  (flexible     │  │  ENGINE        │
   │   immutable log)   │  │   schema       │  │  (materialized │
   │                    │  │   entities)    │  │   views, CQRS) │
   └────────────────────┘  └────────────────┘  └────────────────┘
```

**Event Store** — Append-only, immutable log. Every state change is a permanent fact. Partitioned by legal entity. Crypto-shredding for GDPR compliance.

**Entity Graph** — Flexible-schema entities with typed relationships. Vendors, invoices, items, employees — any business object, with attributes that can vary by configuration.

**Rules Engine** — Declarative business rules with four evaluation phases (validate → enrich → decide → post-commit). Rules are versioned, effective-dated, and produce audit traces showing exactly which conditions were checked and what actions were taken.

**Projection Engine** — Materialized views built from events. Trial balance, AP aging, inventory on hand — each projection is optimized for its query pattern. Projections are rebuildable from events at any time. Supports eventual, strong, and verified consistency levels.

**Intent Protocol** — The universal interaction pattern. Every state change flows through: receive → authenticate → authorize → validate → plan → approve → execute. Humans, APIs, system events, and AI agents all use the same pipeline with the same security, audit, and governance.

---

## Key Design Decisions

Nova's architecture is documented through 18 Architecture Decision Records (ADRs) in [`docs/architecture/ADR_LOG.md`](docs/architecture/ADR_LOG.md). The most consequential decisions:

- **Event sourcing as system of record** — not CRUD with audit bolted on (ADR-001)
- **PostgreSQL for all storage at MVP** — polyglot persistence is a scale-up path, not day-one complexity (ADR-002)
- **Crypto-shredding for PII deletion** — per-subject encryption keys; destroy key = erase data without modifying immutable events (ADR-004)
- **TypeScript end-to-end** — one language, fast iteration; extract hot paths to Rust when profiling data justifies it (ADR-005)
- **LLM as planner, system as authority** — AI agents reason and propose; deterministic rules validate and decide (ADR-012)
- **Walking skeleton development** — build thin slice through all components first, then deepen (ADR-016)

Each ADR includes context, rationale, alternatives considered, and consequences.

---

## Project Status

Nova is in **Phase 0 — Foundation Engine**. The architecture has been through three independent reviews with two rounds of validation. The specification corpus is complete enough to build from.

### What Exists Today

| Artifact | Status | Description |
|----------|--------|-------------|
| Architecture Spec | ✅ Complete | High-level system design (3,700 lines) |
| Event Store Spec | ✅ Complete | Deep implementation spec with schemas, interfaces, APIs (2,350 lines) |
| Financial Dimensions Spec | ✅ Complete | Dimensional accounting model (1,835 lines) |
| Review Synthesis | ✅ Complete | All review feedback consolidated with decisions (1,088 lines) |
| ADR Log | ✅ Complete | 18 architecture decisions with rationale (612 lines) |
| NFR Document | ✅ Complete | Performance targets, phase gate criteria (405 lines) |
| Build Plan | ✅ Complete | Week-by-week Phase 0 plan (538 lines) |
| Document Index | ✅ Complete | Map of all 47 planned specifications (142 lines) |
| **Working code** | 🔲 Phase 0 | Building now |

### What's Being Built (Phase 0 — Walking Skeleton)

**Week 1-2 goal:** One intent flows through the complete pipeline — intent submitted → rules validate → event appended → projection updated → query returns result → audit trace complete.

**Week 5-6 goal:** Full AP invoice lifecycle (submit → 3-way match → approve → post to GL → pay) running as stress test against the engine.

**Phase 0 exit gate:** Automated stress tests verifying throughput (>2,000 events/sec), projection lag (<1s p99), concurrent correctness, idempotency, and financial reconciliation (zero variance).

See [`docs/roadmap/BUILD_PLAN.md`](docs/roadmap/BUILD_PLAN.md) for the complete plan.

---

## Documentation

| Document | Audience | Purpose |
|----------|----------|---------|
| [`docs/guides/CONCEPTS.md`](docs/guides/CONCEPTS.md) | Everyone | Core concepts explained: events, entities, rules, projections, intents |
| [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md) | Architects, senior engineers | Full architecture specification |
| [`docs/architecture/ADR_LOG.md`](docs/architecture/ADR_LOG.md) | Architects, contributors | Every major design decision with rationale |
| [`docs/specs/`](docs/specs/) | Implementers | Deep implementation specs (TypeScript interfaces, PostgreSQL schemas, APIs) |
| [`docs/reference/REVIEW_SYNTHESIS.md`](docs/reference/REVIEW_SYNTHESIS.md) | Reviewers, contributors | How the architecture was validated and refined |
| [`docs/reference/NFR.md`](docs/reference/NFR.md) | Operations, contributors | Performance targets and phase gate criteria |
| [`docs/roadmap/BUILD_PLAN.md`](docs/roadmap/BUILD_PLAN.md) | Contributors | What's being built, in what order, with what acceptance criteria |

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript (strict mode) | Single language end-to-end; fast iteration; see ADR-005 |
| Runtime | Node.js 20+ LTS | I/O-bound workloads; worker threads for CPU-bound tasks |
| Database | PostgreSQL 16+ | Event store, entity graph, and projections — all in one; see ADR-002 |
| Package manager | pnpm | Workspace-aware, fast, disk-efficient |
| Testing | Vitest + Testcontainers | Unit + integration with real PostgreSQL in Docker |
| Load testing | k6 | Stress tests for phase gate criteria |

---

## Repository Structure

```
nova/
├── docs/
│   ├── architecture/
│   │   ├── OVERVIEW.md              # Full architecture specification
│   │   └── ADR_LOG.md               # Architecture Decision Records
│   ├── specs/
│   │   ├── DOCUMENT_INDEX.md        # Map of all specifications
│   │   ├── engine/                  # Core engine component specs
│   │   ├── governance/              # Security, privacy, audit specs
│   │   ├── organization/            # Multi-entity, dimensions specs
│   │   ├── capabilities/            # Business capability specs (GL, AP, AR...)
│   │   ├── agents/                  # Agent framework specs
│   │   ├── interface/               # UI and interaction specs
│   │   └── platform/               # Extensibility, localization, admin specs
│   ├── reference/
│   │   ├── REVIEW_SYNTHESIS.md      # Architecture review feedback + decisions
│   │   └── NFR.md                   # Non-functional requirements
│   ├── roadmap/
│   │   └── BUILD_PLAN.md            # Phase-by-phase build plan
│   ├── guides/
│   │   ├── CONCEPTS.md              # Core concepts for newcomers
│   │   ├── GETTING_STARTED.md       # Clone → run → see it work
│   │   └── FIRST_CONTRIBUTION.md    # How to pick up your first task
│   └── rfcs/
│       └── TEMPLATE.md              # Template for community proposals
│
├── packages/
│   ├── core/                        # Event store, entity graph, rules, projections
│   ├── intent/                      # Intent protocol pipeline
│   ├── governance/                  # Security, privacy, audit
│   ├── capabilities/                # Business capabilities (GL, AP, AR...)
│   ├── api/                         # REST API layer
│   └── agents/                      # Agent framework and implementations
│
├── tests/
│   ├── integration/                 # Full pipeline tests
│   ├── load/                        # Stress tests (k6 scripts)
│   └── fixtures/                    # Synthetic test data generators
│
├── config/                          # Rule definitions, projection configs
├── migrations/                      # Database migrations
│
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json
└── tsconfig.json
```

---

## Contributing

Nova is in early development and we welcome contributors — especially those with experience in ERP systems, event sourcing, distributed systems, or enterprise AI.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines, and [`docs/roadmap/BUILD_PLAN.md`](docs/roadmap/BUILD_PLAN.md) for what's being built now.

### Good First Contributions

- **Review a spec** — Read an implementation spec and file issues for gaps, ambiguities, or mistakes
- **Write a queued spec** — The Document Index shows 41 specs still to be written, each with a clear scope
- **Implement a component** — Pick a spec, build it, test against acceptance criteria
- **Add industry knowledge** — ERP domain expertise (manufacturing, distribution, retail) is as valuable as code

---

## License

Nova is licensed under [AGPL-3.0](LICENSE) for the engine and application code. Documentation and specifications are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

This means:
- **You can** use, modify, and distribute Nova freely
- **You can** build commercial products on Nova
- **If you modify** the engine and offer it as a service, you must share your modifications under the same license
- **Documentation** can be freely shared and adapted with attribution

---

## Contact

For questions about architecture, contributions, or the project roadmap, open a Discussion on GitHub.
