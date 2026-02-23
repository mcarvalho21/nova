# Getting Started with Nova

> **Note:** Nova is in Phase 0 (Foundation Engine). This guide will be completed once the walking skeleton produces a runnable system. Check back soon, or follow the repository for updates.

## What You'll Be Able to Do

Once Phase 0.1 is complete, this guide will walk you through:

1. **Clone and install** — get Nova running locally in under 5 minutes
2. **Create a vendor** — submit your first intent through the complete pipeline
3. **Submit an invoice** — see rules validation, event creation, and projection updates
4. **Query the audit trail** — trace every step of what happened and why
5. **Explore projections** — see how events become queryable business views

## In the Meantime

- Read the [Core Concepts](CONCEPTS.md) to understand Nova's architecture
- Browse the [Architecture Spec](../architecture/OVERVIEW.md) for the full system design
- Review the [Build Plan](../roadmap/BUILD_PLAN.md) to see what's being built

## Prerequisites (for when the code is ready)

- Node.js 20+ LTS
- pnpm 8+
- Docker (for PostgreSQL via Testcontainers)

```bash
git clone https://github.com/[org]/nova.git
cd nova
pnpm install
pnpm dev           # Start development server
pnpm test          # Run tests
```

*This guide will be updated with a complete walkthrough once the walking skeleton is functional.*
