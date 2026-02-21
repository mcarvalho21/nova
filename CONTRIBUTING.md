# Contributing to Nova

Thank you for your interest in Nova. This guide covers how to contribute effectively — whether you're writing code, reviewing specs, or sharing domain expertise.

---

## How Nova Is Built

Nova follows a **spec-first, walking-skeleton** development approach:

1. **Specifications** describe each component in detail — TypeScript interfaces, PostgreSQL schemas, API contracts, business rules, test scenarios, and acceptance criteria.
2. **Implementation** follows the spec. Each component is built, tested against its acceptance criteria, and integrated with the rest of the engine.
3. **Phase gates** validate that the engine meets performance and correctness targets before new capabilities are added.

The [`docs/specs/DOCUMENT_INDEX.md`](docs/specs/DOCUMENT_INDEX.md) maps every specification, its status, and build order. The [`docs/roadmap/BUILD_PLAN.md`](docs/roadmap/BUILD_PLAN.md) shows what's being built now and what's next.

---

## Ways to Contribute

### Review Specifications

Every deep spec benefits from expert review. Pick any spec from the Document Index and look for:
- Missing edge cases in business rules
- Gaps in TypeScript interfaces or API contracts
- Performance concerns with the PostgreSQL schema design
- Acceptance criteria that don't cover important scenarios

File issues with the spec filename in the title (e.g., "01_EVENT_STORE: Missing index for cross-partition correlation queries").

### Write a Queued Specification

The Document Index shows 41 specs still to be written. Each has a brief description of scope. To write one:

1. Read the Architecture Spec overview for that component
2. Read 2-3 completed specs (Event Store, Financial Dimensions) to understand the format and depth expected
3. Include: TypeScript interfaces, PostgreSQL schemas, REST API contracts, business rules with edge cases, error handling, performance considerations, test scenarios, and acceptance criteria
4. Submit as a PR against `docs/specs/`

Specs should contain enough detail that an engineer (or Claude Code) can implement the component without additional design work.

### Implement a Component

Each spec is designed to be self-contained enough for implementation:

1. Read the spec and its acceptance criteria
2. Implement in the appropriate package under `packages/`
3. Write tests covering every acceptance criterion
4. Ensure integration tests pass (the component works with the rest of the engine)
5. Submit as a PR

### Share Domain Expertise

ERP is a domain where implementation details matter enormously. If you have experience with:
- Manufacturing (BOM explosions, production scheduling, shop floor control)
- Financial accounting (multi-currency, consolidation, regulatory reporting)
- Supply chain (procurement, inventory costing methods, warehouse operations)
- HR / Payroll (compliance, benefits, tax calculations)
- Industry-specific processes (retail, distribution, process manufacturing)

...your knowledge is extremely valuable. Open a Discussion or file issues describing real-world scenarios, edge cases, or requirements that the current specs don't address.

### Propose Architectural Changes

For changes that affect the core architecture:

1. Write an RFC using the template in `docs/rfcs/TEMPLATE.md`
2. Submit as a PR for discussion
3. If accepted, the change becomes an ADR in the Architecture Decision Records

RFCs are for structural changes — new engine components, changes to the intent protocol, new isolation models, etc. Bug fixes, spec improvements, and implementation work don't need RFCs.

---

## Development Setup

### Prerequisites

- Node.js 20+ LTS
- pnpm 8+
- Docker (for PostgreSQL via Testcontainers)
- PostgreSQL 16+ (for local development without Docker)

### Getting Started

```bash
git clone https://github.com/[org]/nova.git
cd nova
pnpm install
pnpm test          # Run unit tests
pnpm test:int      # Run integration tests (requires Docker)
pnpm test:load     # Run load tests (requires running instance)
```

### Project Structure

```
packages/
├── core/          # Event store, entity graph, rules engine, projection engine
├── intent/        # Intent protocol pipeline
├── governance/    # Security, privacy, audit
├── capabilities/  # Business capabilities (GL, AP, AR, etc.)
├── api/           # REST API layer
└── agents/        # Agent framework and implementations
```

Each package is independently buildable and testable. Integration tests in `tests/integration/` verify cross-package behavior.

---

## Code Standards

### TypeScript

- Strict mode enabled, no `any` types in core engine
- Interfaces over classes where possible (data contracts over inheritance)
- Explicit error types (no thrown strings, no generic `Error`)
- Pure functions preferred; side effects isolated to clearly marked boundaries

### Testing

- Unit tests alongside source files (`*.test.ts`)
- Integration tests in `tests/integration/`
- Every acceptance criterion from the spec must have a corresponding test
- Load tests use k6 scripts in `tests/load/`

### Database

- All schema changes via forward-only migrations in `migrations/`
- No raw SQL in application code — use parameterized queries
- Every projection table must include RLS policy definition
- Every new index must include a comment explaining what query pattern it supports

### Commits

- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`
- Reference the spec or issue: `feat(event-store): add natural business key deduplication indexes (01_EVENT_STORE §3.1)`
- One logical change per commit

---

## Pull Request Process

1. **Fork and branch** from `main`
2. **Name the branch** descriptively: `feat/event-store-crypto-shredding`, `docs/entity-graph-spec`, `fix/projection-rebuild-snapshot-invalidation`
3. **Write tests** for any new functionality
4. **Run the full test suite** before submitting
5. **Describe the change** in the PR — what it does, which spec it implements, and how to verify
6. **Link to the spec** section that describes what you've built

PRs are reviewed for:
- Correctness against the spec's acceptance criteria
- Test coverage
- Code clarity and consistency with existing patterns
- Performance implications (especially for hot paths in the event store and projection engine)

---

## Architecture Decision Records

Major design decisions are recorded in [`docs/architecture/ADR_LOG.md`](docs/architecture/ADR_LOG.md). Each ADR includes:

- **Context** — what problem or question prompted the decision
- **Decision** — what we chose
- **Rationale** — why, with specific technical reasoning
- **Alternatives considered** — what else we evaluated and why we rejected it
- **Consequences** — tradeoffs accepted

ADRs are immutable once recorded. If a decision is superseded, the original ADR is marked as such with a link to the replacement — never deleted. This preserves the reasoning history.

To propose a new ADR, include it in your RFC or PR with the full template filled out.

---

## Community Guidelines

- **Be constructive.** Critique ideas, not people. "This schema has a scaling problem because X" is helpful. "This is wrong" is not.
- **Show your work.** When proposing changes, explain the reasoning. Link to real-world examples, benchmarks, or prior art.
- **Respect domain expertise.** ERP is a field where decades of experience matter. Someone who has implemented FIFO costing in production knows things that aren't in textbooks.
- **Start small.** Review a spec, fix a typo, add a test case. Build context before proposing sweeping changes.

---

## Questions?

- **Architecture questions** — open a Discussion tagged `architecture`
- **Spec clarifications** — file an issue referencing the specific spec and section
- **Build help** — open a Discussion tagged `help`
- **Feature proposals** — write an RFC using the template
