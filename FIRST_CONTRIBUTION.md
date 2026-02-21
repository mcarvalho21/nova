# Your First Contribution to Nova

Welcome! This guide helps you make your first contribution, whether that's reviewing a spec, filing an issue, or writing code.

---

## Understand the Project (30 minutes)

Before contributing, spend time understanding what Nova is and how it works:

1. Read the [README](../../README.md) — 5 minutes, gives you the big picture
2. Read [Core Concepts](CONCEPTS.md) — 15 minutes, explains events, entities, rules, projections, and intents
3. Skim the [Document Index](../specs/DOCUMENT_INDEX.md) — 5 minutes, shows the scope and what's built vs planned

You don't need to read the full Architecture Spec or deep implementation specs to make your first contribution.

---

## Choose Your Path

### Path 1: Review a Specification (No Code Required)

The most immediately valuable contribution is expert review of the implementation specs. These specs drive all development — catching a gap or edge case in a spec prevents bugs before code is written.

**How to do it:**
1. Pick a spec from the [Document Index](../specs/DOCUMENT_INDEX.md) — start with one matching your expertise
2. Read it critically. Ask yourself:
   - Are there business scenarios this doesn't handle?
   - Are the TypeScript interfaces complete?
   - Would the PostgreSQL schema perform well at scale?
   - Are the acceptance criteria sufficient to verify correctness?
3. File issues for anything you find. Reference the specific spec and section.

**What makes a good spec review:**
- "Section 3.1: The events table doesn't have an index for querying by effective_date range within a partition. Financial reporting queries will need this." ✅
- "The spec looks incomplete." ❌ (too vague to act on)

### Path 2: File an Issue from Domain Experience

If you've worked with ERP systems, you know real-world edge cases that specs might miss.

**Examples of valuable domain issues:**
- "AP matching: the spec handles 3-way match (PO/receipt/invoice) but doesn't address 2-way match scenarios common in services procurement where there's no goods receipt"
- "Inventory costing: FIFO layer consumption needs to handle partial returns — when a return arrives, which FIFO layer does it credit back to?"
- "Multi-currency: the spec should address the difference between transaction currency, accounting currency, and reporting currency — these are three distinct concepts"

Tag domain issues with `domain-expertise` so maintainers can prioritize them.

### Path 3: Write a Queued Specification

The Document Index shows 41 specs still to be written. If you have deep knowledge of a specific area, writing the spec is enormously valuable.

**Before writing:**
1. Read 2-3 completed specs to understand the expected format and depth
2. Read the Architecture Spec section for your component
3. Open a Discussion or issue saying "I'd like to write spec XX — here's my planned approach" to coordinate

**A complete spec includes:**
- TypeScript interfaces for all data structures
- PostgreSQL schema with indexes and constraints
- REST API contracts (endpoints, request/response formats, error codes)
- Business rules with edge cases
- State machines for entity lifecycles
- Error handling (specific error types, not generic catches)
- Performance considerations
- Test scenarios covering happy path and edge cases
- Acceptance criteria (checkbox list of what "done" means)

### Path 4: Implement a Component

Once specs exist and the walking skeleton is in place:

1. Pick a component with a completed spec
2. Read the spec's acceptance criteria — these are your definition of done
3. Implement in the appropriate package
4. Write tests for every acceptance criterion
5. Run integration tests to verify your component works with the rest of the engine
6. Submit a PR referencing the spec

---

## Development Setup

```bash
git clone https://github.com/[org]/nova.git
cd nova
pnpm install

pnpm test          # Unit tests
pnpm test:int      # Integration tests (requires Docker)
pnpm test:load     # Load tests (requires running instance)
pnpm dev           # Start development server with hot reload
```

---

## Asking Questions

- **"I don't understand this part of the architecture"** — open a Discussion tagged `question`
- **"This spec seems to contradict that spec"** — file an issue referencing both specs
- **"I want to contribute but don't know where to start"** — open a Discussion tagged `help`, mention your background and we'll suggest a good starting point

---

## What Happens After You Submit

- **Spec reviews and issues** — a maintainer will triage within a few days
- **Spec PRs** — reviewed for completeness, consistency with architecture, and business logic depth
- **Code PRs** — reviewed for correctness against spec acceptance criteria, test coverage, and code quality
- **RFCs** — discussed in the PR, potentially presented in a community call for larger changes

Your first contribution doesn't need to be perfect. It needs to be specific and thoughtful. Welcome aboard.
