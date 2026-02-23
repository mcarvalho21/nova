# Project Nova — Specification Document Index

**Master Architecture:** [`docs/architecture/OVERVIEW.md`](../architecture/OVERVIEW.md) (complete — high-level overview of entire system)

---

## Deep Implementation Specifications

Each deep spec contains: TypeScript interfaces, PostgreSQL schemas, REST API contracts, state machines, business rules with edge cases, error handling, performance considerations, test scenarios, and acceptance criteria.

### Engine (Foundation — Build First)

| # | Document | Status | Lines | Description |
|---|----------|--------|-------|-------------|
| 01 | `engine/01_EVENT_STORE.md` | ✅ Complete | ~2,350 | Append-only event log, partitioning, subscriptions, lineage, crypto-shredding, idempotency, OCC, schema evolution |
| 02 | `engine/02_ENTITY_GRAPH.md` | 🔲 Next | — | Flexible schema entities, relationships, graph traversal, identity resolution, golden records |
| 03 | `engine/03_RULES_ENGINE.md` | 🔲 Queued | — | Declarative rules, condition language, actions, evaluation tracing, versioning |
| 04 | `engine/04_PROJECTION_ENGINE.md` | 🔲 Queued | — | Materialized views, refresh strategies, CQRS, snapshots, simulation/forking |
| 05 | `engine/05_INTENT_PROTOCOL.md` | 🔲 Queued | — | Intent lifecycle pipeline, resolution, approval orchestration, NL parsing |

### Governance (Build Second)

| # | Document | Status | Description |
|---|----------|--------|-------------|
| 06 | `governance/06_SECURITY_MODEL.md` | 🔲 Queued | Capabilities, duties, roles, SoD enforcement, field masking, scope enforcement |
| 07 | `governance/07_PRIVACY_ENGINE.md` | 🔲 Queued | PII classification, consent, data residency, right to deletion, data subject access |
| 08 | `governance/08_AUDIT_ENGINE.md` | 🔲 Queued | Continuous controls, audit projections, auditor portal, evidence generation |

### Organization (Build Third)

| # | Document | Status | Description |
|---|----------|--------|-------------|
| 09 | `organization/09_MULTI_ENTITY.md` | 🔲 Queued | Legal entities, config inheritance, intercompany events, consolidation projections |
| 10 | `organization/10_FINANCIAL_DIMENSIONS.md` | ✅ Complete | Dimension definitions, defaults, inheritance, validation rules, posting rules |
| 11 | `organization/11_NUMBER_SEQUENCES.md` | 🔲 Queued | Configurable sequences, gap-free option, fiscal year reset |

### Business Capabilities (Build Fourth)

| # | Document | Status | Description |
|---|----------|--------|-------------|
| 12 | `capabilities/12_GENERAL_LEDGER.md` | 🔲 Queued | Chart of accounts, journal framework, period management, financial statements |
| 13 | `capabilities/13_ACCOUNTS_PAYABLE.md` | 🔲 Queued | Invoice lifecycle, 3-way matching, payment processing, vendor management |
| 14 | `capabilities/14_ACCOUNTS_RECEIVABLE.md` | 🔲 Queued | Billing, payment receipt, credit management, collections |
| 15 | `capabilities/15_PROCUREMENT.md` | 🔲 Queued | Requisitions, POs, RFQs, vendor evaluation, purchase agreements |
| 16 | `capabilities/16_INVENTORY_MANAGEMENT.md` | 🔲 Queued | Item master, transactions, costing methods, tracking dimensions |
| 17 | `capabilities/17_WAREHOUSE_MANAGEMENT.md` | 🔲 Queued | Locations, waves, work creation, mobile operations |
| 18 | `capabilities/18_PRODUCTION_CONTROL.md` | 🔲 Queued | BOMs, routes, production orders, resource scheduling |
| 19 | `capabilities/19_CONTINUOUS_PLANNING.md` | 🔲 Queued | Reactive demand/supply graph, coverage rules, planned orders |
| 20 | `capabilities/20_MASTER_DATA_MANAGEMENT.md` | 🔲 Queued | Identity resolution, golden records, data quality, enrichment |
| 21 | `capabilities/21_CRM.md` | 🔲 Queued | Leads, opportunities, quotes, campaigns, activities |
| 22 | `capabilities/22_CUSTOMER_SERVICE.md` | 🔲 Queued | Cases, SLAs, knowledge base, queues |
| 23 | `capabilities/23_FIELD_SERVICE.md` | 🔲 Queued | Work orders, assets, dispatch, service agreements |
| 24 | `capabilities/24_CONTACT_CENTER.md` | 🔲 Queued | Multi-channel interactions, routing, AI assist |

### Agents (Build alongside capabilities)

| # | Document | Status | Description |
|---|----------|--------|-------------|
| 25 | `agents/25_AGENT_FRAMEWORK.md` | 🔲 Queued | Identity, capabilities, boundaries, trust levels, lifecycle |
| 26 | `agents/26_AGENT_COLLABORATION.md` | 🔲 Queued | Claims, escalation, negotiation, multi-agent coordination |
| 27 | `agents/27_A2A_PROTOCOL.md` | 🔲 Queued | Cross-enterprise agent-to-agent negotiation protocol |

### Interface (Build after core capabilities)

| # | Document | Status | Description |
|---|----------|--------|-------------|
| 28 | `interface/28_CONVERSATIONAL_UI.md` | 🔲 Queued | NL interaction, intent parsing, context management |
| 29 | `interface/29_WORKSPACE_UI.md` | 🔲 Queued | Task queues, resolution workspaces, dashboards |
| 30 | `interface/30_ANALYTICAL_UI.md` | 🔲 Queued | Ad-hoc queries, visualizations, drill-down |
| 31 | `interface/31_MOBILE.md` | 🔲 Queued | Mobile-optimized interactions, approvals, capture |
| 32 | `interface/32_PERSONALIZATION.md` | 🔲 Queued | Workspace, behavioral, intelligence personalization |

### Platform (Build incrementally)

| # | Document | Status | Description |
|---|----------|--------|-------------|
| 33 | `platform/33_EXTENSIBILITY.md` | 🔲 Queued | Schema extensions, custom rules, sandboxed capabilities |
| 34 | `platform/34_WORKFLOW_APPROVALS.md` | 🔲 Queued | Intent lifecycle stages, approval routing, SLA, delegation |
| 35 | `platform/35_REPORTING.md` | 🔲 Queued | Projections as reports, ad-hoc, financial reporting |
| 36 | `platform/36_LOCALIZATION.md` | 🔲 Queued | Regulatory rules, localization packs, document adapters |
| 37 | `platform/37_B2B_EVENT_MESH.md` | 🔲 Queued | Shared event spaces, cross-enterprise events |
| 38 | `platform/38_SETUP_EVOLUTION.md` | 🔲 Queued | Industry templates, guided setup, change lifecycle |
| 39 | `platform/39_ADMINISTRATION.md` | 🔲 Queued | Config management, health monitoring, environment management |
| 40 | `platform/40_PHYSICAL_AGENTS_IOT.md` | 🔲 Queued | Robots, drones, IoT, telemetry tier, digital twins |

### Architecture & Reference Documents

| Document | Location | Status | Description |
|----------|----------|--------|-------------|
| Architecture Spec | `docs/architecture/OVERVIEW.md` | ✅ Complete | Master system design (3,732 lines) |
| ADR Log | `docs/architecture/ADR_LOG.md` | ✅ Complete | 18 Architecture Decision Records with context, rationale, alternatives |
| Review Synthesis | `docs/reference/REVIEW_SYNTHESIS.md` | ✅ Complete | Architecture review feedback — accepted changes, rejected items, resolved open questions |
| NFR | `docs/reference/NFR.md` | ✅ Complete | Performance targets, availability, security, tiered phase gate criteria |
| Build Plan | `docs/roadmap/BUILD_PLAN.md` | ✅ Complete | Walking skeleton — Phase 0 vertical slice, stress test gates, AP wedge capability |
| Config Schema | `docs/reference/CONFIG_SCHEMA.md` | 🔲 Queued | Complete YAML configuration schema |
| Event Catalog | `docs/reference/EVENT_CATALOG.md` | 🔲 Queued | All event types across all modules |
| Intent Catalog | `docs/reference/INTENT_CATALOG.md` | 🔲 Queued | All intent types across all modules |
| Projection Catalog | `docs/reference/PROJECTION_CATALOG.md` | 🔲 Queued | All projections across all modules |
| Rule Templates | `docs/reference/RULE_TEMPLATES.md` | 🔲 Queued | Standard business and regulatory rules |
| Industry Templates | `docs/reference/INDUSTRY_TEMPLATES.md` | 🔲 Queued | Per-industry configuration templates |
| Database Schema | `docs/reference/DATABASE_SCHEMA.md` | 🔲 Queued | Complete PostgreSQL schema |

### Guides

| Document | Location | Description |
|----------|----------|-------------|
| Core Concepts | `docs/guides/CONCEPTS.md` | Events, entities, rules, projections, intents explained for newcomers |
| Getting Started | `docs/guides/GETTING_STARTED.md` | Clone → run → see it work (placeholder until Phase 0.1 complete) |
| First Contribution | `docs/guides/FIRST_CONTRIBUTION.md` | How to pick up your first task |

---

## Recommended Build Order

**Development follows the Walking Skeleton approach (see `docs/roadmap/BUILD_PLAN.md`):**

Phase 0 builds a vertical slice through ALL engine components simultaneously, not sequentially.

**For Claude Code sessions, build in this order:**

1. **Walking Skeleton (Week 1-2):** Minimum of all 5 engine specs simultaneously
   - `01_EVENT_STORE.md` → minimum: append, read, idempotency
   - `02_ENTITY_GRAPH.md` → minimum: create, read, version check
   - `03_RULES_ENGINE.md` → minimum: condition eval, trace generation
   - `04_PROJECTION_ENGINE.md` → minimum: subscribe, update, query
   - `05_INTENT_PROTOCOL.md` → minimum: receive, validate, execute
2. **Deepen Engine (Week 3-4):** Add security, approvals, rules depth, projection rebuild
3. **AP Invoice Lifecycle (Week 5-6):** First business scenario + stress tests
4. **Governance (Phase 1):** `06_SECURITY_MODEL.md` → `07_PRIVACY_ENGINE.md` → `08_AUDIT_ENGINE.md`
5. **Organization (Phase 2):** `09_MULTI_ENTITY.md` + `10_FINANCIAL_DIMENSIONS.md`
6. **Finance (Phase 2):** `12_GENERAL_LEDGER.md` → `13_ACCOUNTS_PAYABLE.md` (full)
7. Continue per BUILD_PLAN.md roadmap...

Each phase has an exit gate (stress tests with pass/fail criteria). Do not proceed to next phase until gate passes.

**Key reference documents to read before building:**
- `docs/reference/REVIEW_SYNTHESIS.md` — all architectural changes from reviews
- `docs/architecture/ADR_LOG.md` — rationale for every major design decision
- `docs/reference/NFR.md` — performance targets and phase gate criteria
- `docs/roadmap/BUILD_PLAN.md` — detailed week-by-week plan with deliverables

---

**Total estimated specs:** 47 documents  
**Completed:** 7 (architecture + event store + financial dimensions + review synthesis + ADR log + NFR + build plan)  
**Remaining:** 40  
