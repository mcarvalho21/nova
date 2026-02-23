# Nova Core Concepts

This guide explains the five foundational ideas behind Nova. If you understand these, you can navigate the codebase, read the specs, and contribute meaningfully.

---

## 1. Events — The Source of Truth

In Nova, the database doesn't store "current state." It stores **every fact that has ever happened**, as an immutable, append-only log.

When a vendor invoice is submitted, Nova doesn't insert a row into an `invoices` table. It appends an event:

```json
{
  "type": "ap.invoice.submitted",
  "effective_date": "2026-02-21",
  "actor": { "type": "human", "id": "user-42", "name": "Maria Chen" },
  "data": {
    "invoice_number": "INV-2024-0891",
    "vendor_id": "V-1042",
    "amount": 15750.00,
    "currency": "USD"
  }
}
```

This event is permanent. It can never be updated or deleted. If the invoice is later cancelled, that's a new event (`ap.invoice.cancelled`) — the original submission fact remains in the log forever.

**Why this matters:**
- Complete audit trail by construction — every change is permanently recorded
- Temporal queries are trivial — "what was the AP balance on March 15?" is answered by replaying events up to that date
- Debugging is deterministic — any system state can be reproduced by replaying the event stream
- New read models can be built from historical events without migration

**Three timestamps on every event:**
- `occurred_at` — when it happened in the real world (user's clock)
- `recorded_at` — when the event store accepted it (system clock, authoritative for ordering)
- `effective_date` — which business date it counts toward (drives accounting periods)

---

## 2. Entities — Flexible Business Objects

Entities are the business objects in Nova — vendors, invoices, items, employees, purchase orders. Unlike traditional ERP where each entity type has a fixed table schema, Nova entities have flexible attributes stored as structured data.

An entity has:
- A **type** (vendor, item, invoice, etc.)
- **Attributes** (name, address, tax ID — varies by type and configuration)
- **Relationships** to other entities (vendor → invoices, invoice → purchase order)
- A **version** number (incremented on each change, used for concurrency control)

Entities don't store their own history — the event stream does. The entity's current state is derived from its events. But for performance, the entity graph maintains the latest state as a queryable projection.

**Key design choice:** Entity schemas are configurable, not hardcoded. A manufacturing company's "item" entity has BOM and routing attributes. A distribution company's "item" doesn't. Both use the same entity graph infrastructure with different configurations.

---

## 3. Rules — Declarative Business Logic

Instead of embedding business logic in application code, Nova uses a declarative rules engine. Rules are data, not code — they can be versioned, effective-dated, and traced.

A rule has:
- **Conditions** — when does this rule apply?
- **Actions** — what happens when conditions are met?
- **Priority** — which rule wins when multiple match?
- **Effective dates** — when is this rule active?

Example:

```yaml
rule: ap.sod.submitter_cannot_approve
  condition: 
    - event.type == "ap.invoice.approve"
    - intent.actor == invoice.submitted_by
  action: reject("Segregation of duties violation: submitter cannot approve their own invoice")
  priority: 1
  effective_from: 2026-01-01
```

Rules evaluate in four phases:
1. **Validate** — check conditions, reject invalid intents
2. **Enrich** — set defaults, derive values
3. **Decide** — approve, reject, or escalate
4. **Post-commit** — trigger side effects (notifications, webhooks) only after the transaction succeeds

Every rule evaluation produces a trace: which rules fired, which conditions matched, what actions were taken. This trace is stored alongside the event for audit.

**Why declarative rules matter:**
- Business logic is visible and auditable (not buried in code)
- Rules can change without code deployment (effective-dated versioning)
- Audit trails show exactly which rules were evaluated for every decision
- AI agents are governed by the same rules as humans — no separate governance layer needed

---

## 4. Projections — Computed Views

If events are the source of truth, how do you answer queries like "show me all overdue invoices" or "what's the trial balance for Q3"? You don't scan the entire event log every time. You use **projections**.

A projection is a materialized view — a pre-computed data structure optimized for a specific query pattern, built and maintained by processing events:

```
Events:
  ap.invoice.submitted (INV-001, $5,000, due 2026-03-01)
  ap.invoice.submitted (INV-002, $3,200, due 2026-02-15)
  ap.invoice.paid      (INV-002, $3,200)

AP Aging Projection:
  ┌─────────┬────────┬──────────┬─────────┐
  │ Invoice │ Amount │ Due Date │ Status  │
  ├─────────┼────────┼──────────┼─────────┤
  │ INV-001 │ $5,000 │ 2026-03  │ Current │
  │ INV-002 │ $3,200 │ 2026-02  │ Paid    │
  └─────────┴────────┴──────────┴─────────┘
```

When a new event arrives, the projection engine updates the relevant projections. When you query "show overdue invoices," you read from the projection — fast, indexed, pre-computed.

**Key properties:**
- **Rebuildable** — any projection can be destroyed and rebuilt from events. This means you can add new projections to historical data, fix projection bugs by replaying, or migrate schemas without data loss.
- **Multiple views from same events** — one event might update the AP aging projection, the trial balance, the vendor balance, and the cash flow forecast. Each projection is optimized for its purpose.
- **Consistency levels** — dashboards read from projections (fast, might lag by milliseconds). Critical operations like payment execution read from the event store directly (zero lag, authoritative).

---

## 5. Intents — The Universal Interaction Pattern

Every state change in Nova flows through the **Intent Protocol** — a multi-stage pipeline that enforces consistent security, validation, and audit regardless of who or what initiates the change.

```
Human clicks "Submit Invoice" in UI
    ↓
API client posts a JSON payload
    ↓
AI agent decides to approve a payment
    ↓
System timer triggers a scheduled action
    ↓
ALL of these become an Intent:
    ↓
┌──────────────────────────────────────────┐
│ Receive → Authenticate → Authorize →     │
│ Validate (rules) → Plan → Approve →     │
│ Execute (append events)                  │
└──────────────────────────────────────────┘
```

There is no alternative path for mutating system state. You cannot write directly to the event store, update an entity, or modify a projection without going through the intent protocol. This guarantees:

- **Consistent security** — every mutation passes through the same authorization checks
- **Consistent audit** — every mutation is traceable through the same pipeline stages
- **Agent governance for free** — AI agents submit intents through the same pipeline as humans, governed by the same rules and approval workflows

An intent carries:
- What the actor wants to do (`intent_type`: "ap.invoice.submit")
- Who is doing it (`actor`: identity, capabilities, trust level)
- The data (`data`: invoice details)
- An idempotency key (prevents duplicate processing on retries)

The rules engine validates the intent. If approval is required (e.g., invoice above $10,000), the intent is routed to an approver. Once approved and executed, the resulting events are appended to the event store, projections update, and the audit trail is complete.

---

## How They Fit Together

Here's a complete flow — submitting a vendor invoice:

1. **User submits invoice** → Intent created: `ap.invoice.submit`
2. **Intent Protocol** authenticates user, checks capabilities
3. **Rules Engine** validates: is vendor active? is invoice number unique? are required fields present?
4. **Rules Engine** decides: invoice > $10,000 → route for manager approval
5. **Manager approves** → Intent advances to execute
6. **Event Store** appends: `ap.invoice.submitted` (immutable, permanent)
7. **Projection Engine** updates: AP aging, vendor balance, GL subledger
8. **Rules Engine (post-commit)** triggers: notification sent to AP team

Every step is traced. The event records who submitted it, who approved it, which rules were evaluated, and what projections were affected. Six months later, an auditor can reconstruct exactly what happened and why.

---

## What About AI Agents?

An AI agent in Nova is just another participant in the intent protocol. It has:
- An **identity** (like a user, but system-issued)
- **Capabilities** (what it's allowed to do — scoped and bounded)
- A **trust level** (determines what it can do autonomously vs. what requires human approval)

When an AI agent decides to approve a low-value invoice, it submits an intent through the same pipeline as a human. The rules engine checks the agent's capabilities and trust level. If the agent is authorized, the intent proceeds. If not, it's escalated to a human.

The critical principle: **the LLM reasons and proposes; the system validates and decides.** The AI agent uses an LLM to interpret context, identify anomalies, and suggest actions. But the authorization decision is always made by the deterministic rules engine — never by the LLM itself.

---

## Further Reading

- [Architecture Specification](../architecture/OVERVIEW.md) — complete system design
- [Architecture Decision Records](../architecture/ADR_LOG.md) — why every major decision was made
- [Build Plan](../roadmap/BUILD_PLAN.md) — what's being built and when
- [Event Store Spec](../specs/engine/01_EVENT_STORE.md) — deep dive into the foundational component
