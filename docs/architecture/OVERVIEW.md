# Project Nova — Next-Generation ERP Architecture Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** February 16, 2026  

---

## Table of Contents

1. [Vision & Principles](#1-vision--principles)
2. [Core Engine](#2-core-engine)
   - 2.1 Event Store
   - 2.2 Entity Graph
   - 2.3 Rules Engine
   - 2.4 Projection Engine
   - 2.5 Intent Protocol
3. [Agent Framework](#3-agent-framework)
   - 3.1 Agent Identity & Lifecycle
   - 3.2 Capabilities & Boundaries
   - 3.3 Trust Levels
   - 3.4 Agent Collaboration
   - 3.5 Agent-to-Agent (A2A)
4. [Governance Layer](#4-governance-layer)
   - 4.1 Security Model
   - 4.2 Record-Level Security & Scopes
   - 4.3 Roles, Duties & Capabilities
   - 4.4 Privacy Engine
   - 4.5 Audit Engine
5. [Organizational Model](#5-organizational-model)
   - 5.1 Multi-Legal Entity
   - 5.2 Financial Dimensions
   - 5.3 Configuration Inheritance
   - 5.4 Intercompany
   - 5.5 Consolidation
6. [Business Capabilities](#6-business-capabilities)
   - 6.1 General Ledger
   - 6.2 Accounts Payable
   - 6.3 Accounts Receivable
   - 6.4 Procurement
   - 6.5 Inventory Management
   - 6.6 Warehouse Management
   - 6.7 Production Control
   - 6.8 Continuous Planning
   - 6.9 Master Data Management
7. [Extensibility](#7-extensibility)
   - 7.1 Schema Extensions
   - 7.2 Custom Rules
   - 7.3 Custom Capabilities (Sandboxed)
8. [Workflow & Approvals](#8-workflow--approvals)
9. [Regulatory Compliance & Localization](#9-regulatory-compliance--localization)
   - 9.1 Regulatory Rules
   - 9.2 Localization Packs
   - 9.3 Document Adapters
10. [Intelligence Layer](#10-intelligence-layer)
11. [Interface](#11-interface)
    - 11.1 Conversational Mode
    - 11.2 Workspace Mode
    - 11.3 Analytical Mode
    - 11.4 Mobile & Embedded
    - 11.5 Personalization
12. [Reporting & Analytics](#12-reporting--analytics)
13. [B2B & Cross-Enterprise](#13-b2b--cross-enterprise)
14. [Administration & Operations](#14-administration--operations)
15. [Performance & Scalability](#15-performance--scalability)
16. [Extended Capabilities — CRM & Customer](#16-extended-capabilities--crm--customer)
    - 16.1 CRM
    - 16.2 Customer Service
    - 16.3 Field Service
    - 16.4 Contact Center
    - 16.5 Unified Customer 360
    - 16.6 Cross-Module Event Flows
17. [Physical Agents, IoT & Future-Readiness](#17-physical-agents-iot--future-readiness)
    - 17.1 Physical Actor Protocol
    - 17.2 Cross-Actor Orchestration
    - 17.3 Human-AI-Robot Handoff Protocol
    - 17.4 Swarm Intelligence
    - 17.5 IoT & Sensor Networks
    - 17.6 Digital Twins
    - 17.7 Computer Vision
    - 17.8 Actor Capability Evolution
18. [Setup & Evolution](#18-setup--evolution)
    - 18.1 Guided Onboarding (Business Interview)
    - 18.2 Industry Templates
    - 18.3 Process Blueprints
    - 18.4 Intelligent Data Import
    - 18.5 Safe Evolution Framework
    - 18.6 Sandbox-Test-Promote Pipeline
    - 18.7 Configuration Health Monitoring
19. [Technology Stack](#19-technology-stack)
20. [Build Roadmap](#20-build-roadmap)

---

## 1. Vision & Principles

### 1.1 Vision

Project Nova is a next-generation ERP engine built from first principles. It is not a replication of existing ERP systems — it is a fundamental reimagining of how enterprise operational software should work in an era of AI agents, real-time computation, and composable architecture.

The system is designed to be an **ERP engine** — a platform of primitives (events, entities, rules, projections, intents) on top of which business capabilities are composed. The engine does not know what a "purchase order" or "journal entry" is. It knows about entities, events, rules, and intents. Business meaning is configured, not coded.

### 1.2 Core Principles

1. **Events are facts.** Every state change is an immutable event appended to a log. State is derived, never mutated directly. The event store IS the system of record and the audit trail simultaneously.

2. **Intents, not transactions.** Actors (human, agent, system) express what they want to achieve. The system resolves intents into actions through rules, validation, and approval pipelines. The same intent protocol serves all actor types.

3. **Rules, not parameters.** Business logic is expressed as declarative, version-controlled, testable rules — not scattered across thousands of configuration forms. Rules explain themselves: any outcome can be traced to the rules that produced it.

4. **Projections, not queries.** Read models are materialized views over the event stream, maintained continuously. Different projections serve different purposes (operational, analytical, regulatory) from the same event data. Reports are projections with a presentation layer.

5. **Agents are first-class.** AI agents are not an add-on. They are participants in the system with identity, capabilities, boundaries, and trust levels — governed by the same rules engine that governs human actions.

6. **Security is structural.** Data isolation is achieved through scope-partitioned projections, not query filters. Segregation of duties is enforced at configuration time, not detected after the fact. Every access is an event.

7. **Configuration is code.** System setup is declarative, version-controlled, diffable, and promotable across environments. Spinning up a new legal entity or capability is a configuration commit, not weeks of form-clicking.

8. **Composable, not monolithic.** Business capabilities are independent modules that plug into the engine. Organizations assemble only what they need. The platform is extensible without modifying the core.

### 1.3 Terminology

| Term | Definition |
|------|-----------|
| **Event** | An immutable fact representing something that happened. Events are the source of truth. |
| **Entity** | A node in the entity graph representing a business object (vendor, item, account, person). |
| **Relationship** | A typed, directional connection between entities in the graph. |
| **Intent** | A declaration of desired outcome expressed by an actor (human, agent, or system). |
| **Rule** | A declarative condition-action pair that governs system behavior. |
| **Projection** | A materialized read model computed from the event stream. |
| **Scope** | An organizational dimension (legal entity, division, region) that partitions data visibility. |
| **Capability** | An atomic business permission — what an identity can do. |
| **Duty** | A group of capabilities representing a business function. |
| **Role** | A group of duties assigned to an identity, scoped to organizational dimensions. |
| **Agent** | An AI-powered autonomous or semi-autonomous actor with defined capabilities and boundaries. |
| **Localization Pack** | A composable package of regulatory rules, document adapters, and configuration defaults for a jurisdiction. |
| **Golden Record** | A projection-based unified view of a master data entity across all sources and scopes. |

---

## 2. Core Engine

The core engine consists of five foundational components. Every business capability, every governance function, and every interaction mode is built on these primitives.

### 2.1 Event Store

The event store is the heart of the system — an append-only, immutable log of everything that has happened.

#### 2.1.1 Event Structure

```typescript
interface Event {
  // Identity
  id: string;                    // Globally unique event ID (ULID for time-ordering)
  type: string;                  // Namespaced event type (e.g., "finance.invoice.submitted")
  version: number;               // Schema version for this event type
  
  // Temporal
  timestamp: DateTime;           // When the event occurred
  recorded_at: DateTime;         // When the event was recorded (may differ for imports)
  effective_date: Date;          // Business effective date (may differ from timestamp)
  
  // Organizational Context
  scope: {
    legal_entity: string;        // Required: which legal entity
    division?: string;           // Optional: organizational dimension
    region?: string;             // Optional: geographic dimension
    [key: string]: string;       // Extensible scope dimensions
  };
  
  // Actor
  actor: {
    type: "human" | "agent" | "system" | "external";
    id: string;                  // Identity reference
    on_behalf_of?: string;       // Delegation chain
    trust_level?: string;        // For agents
  };
  
  // Causality
  caused_by?: string;            // Parent event ID (for lineage)
  intent_id?: string;            // The intent that generated this event
  correlation_id: string;        // Groups related events across a business process
  
  // Business Data
  data: Record<string, any>;     // Event-type-specific payload
  
  // Dimensional Context
  dimensions: {
    [dimension_name: string]: string;  // Financial and analytical dimensions
  };
  
  // Metadata
  metadata: {
    rules_evaluated: string[];   // Which rules were evaluated
    tags: string[];              // Searchable tags
    pii_fields: string[];        // Which data fields contain PII
    checksum: string;            // Integrity verification
  };
}
```

#### 2.1.2 Event Store Operations

The event store supports the following operations:

| Operation | Description |
|-----------|-------------|
| **append(event)** | Append a new event. Validates schema, assigns ID, enforces immutability. |
| **read(stream_id, from?, to?)** | Read events from a stream (entity stream, scope stream, or global). |
| **subscribe(pattern, handler)** | Subscribe to events matching a pattern for real-time processing. |
| **project(stream, projector)** | Apply a projection function across a stream of events. |
| **snapshot(stream_id, as_of?)** | Get or create a snapshot of projected state at a point in time. |

The event store **never** supports update or delete operations on events. Corrections are made by appending compensating or correcting events.

#### 2.1.3 Stream Organization

Events are organized into streams:

- **Entity streams**: All events related to a specific entity (e.g., all events for vendor V-1042)
- **Scope streams**: All events within a scope partition (e.g., all events for legal entity USMF)
- **Type streams**: All events of a specific type (e.g., all invoice_submitted events)
- **Correlation streams**: All events sharing a correlation ID (e.g., the full procure-to-pay chain for a specific PO)
- **Global stream**: The complete ordered log of all events

#### 2.1.4 Partitioning Strategy

Events are physically partitioned by **legal entity** as the primary partition key. Within a legal entity, events are ordered by timestamp. This ensures:

- Multi-entity operations are parallelizable
- Single-entity consistency is guaranteed (ordered within partition)
- Cross-entity queries (consolidation, intercompany) read from multiple partitions in parallel

Secondary indexes exist on: event type, entity references, correlation ID, actor ID, and dimensional values.

#### 2.1.5 Retention & Archival

```yaml
retention:
  online:
    duration: configurable_per_scope  # default 2 years
    storage: primary_database
    access: real_time
    
  warm_archive:
    duration: configurable  # default 5 years
    storage: compressed_object_store
    access: seconds_latency
    queryable: yes (via archive projection)
    
  cold_archive:
    duration: configurable  # default: regulatory_minimum per jurisdiction
    storage: immutable_archive
    access: minutes_latency
    queryable: metadata_only (full retrieval on request)
    
  pii_events:
    subject_to: retention_rules per pii_class
    deletion: pii_fields redacted, event skeleton preserved for audit integrity
```

---

### 2.2 Entity Graph

The entity graph is a flexible, schema-configurable graph of business objects and their relationships. It replaces the rigid relational tables of traditional ERP.

#### 2.2.1 Entity Structure

```typescript
interface Entity {
  // Identity
  id: string;                    // Globally unique entity ID
  type: string;                  // Entity type (e.g., "vendor", "item", "account")
  
  // Lifecycle
  status: "proposed" | "active" | "under_review" | "inactive" | "archived";
  created_at: DateTime;
  created_by: string;            // Actor reference
  last_modified_event: string;   // Most recent event that affected this entity
  
  // Organizational Context
  scope: {
    visibility: "global" | "scoped";
    owning_scopes: string[];     // Which scopes can modify
    visible_to_scopes: string[]; // Which scopes can read (if scoped)
  };
  
  // Attributes (schema-defined + extensions)
  attributes: Record<string, any>;
  
  // PII Classification
  pii_classification: {
    [field_name: string]: {
      class: "personal_identifier" | "contact_info" | "financial" | "sensitive" | "none";
      retention: string;
      consent_required: boolean;
    };
  };
}
```

#### 2.2.2 Relationship Structure

```typescript
interface Relationship {
  id: string;
  type: string;                  // Relationship type (e.g., "belongs_to", "supplies", "approves")
  source_entity: string;         // Source entity ID
  target_entity: string;         // Target entity ID
  direction: "directed" | "bidirectional";
  
  // Relationship attributes (typed per relationship type)
  attributes: Record<string, any>;  
  // e.g., for a vendor-entity relationship: payment_terms, currency, default_account
  
  // Temporal
  effective_from: Date;
  effective_to?: Date;           // Null = currently active
  
  // Scope
  scope?: {
    legal_entity?: string;       // Relationship may be entity-specific
    division?: string;
  };
}
```

#### 2.2.3 Entity Schema Definition

Entity types are defined through schema configuration — not hardcoded tables:

```yaml
entity_schemas:
  - type: vendor
    description: "External party that supplies goods or services"
    party_type: organization  # Links to the party/address framework
    
    attributes:
      # Core attributes (present on all vendor entities)
      - name: legal_name
        data_type: string
        required: true
        pii_class: none
        indexed: true
        
      - name: tax_id
        data_type: string
        required_per_jurisdiction: true
        pii_class: financial
        masked_for: [roles_without: vendor_master_full_access]
        unique_within: scope.legal_entity
        
      - name: vendor_group
        data_type: enum
        values_from: vendor_group_definitions
        required: true
        indexed: true
        
      - name: default_currency
        data_type: currency_code
        required: true
        
      - name: payment_terms
        data_type: reference
        target: payment_terms_entity
        required: true
        
      - name: bank_accounts
        data_type: collection
        item_type: bank_account_details
        pii_class: financial
        masked_for: [roles_without: vendor_bank_access]
        
    # Relationship types this entity participates in
    relationship_types:
      - type: supplies_to
        target: legal_entity
        attributes: [vendor_number, payment_terms, currency, credit_limit]
        scope: per_legal_entity
        
      - type: primary_contact
        target: person
        cardinality: many_to_one
        
      - type: belongs_to_group
        target: vendor_group
        cardinality: many_to_one
        
    # Identity resolution rules for MDM
    identity_resolution:
      match_fields:
        - tax_id (weight: 0.95, exact_match)
        - legal_name (weight: 0.7, fuzzy_match, threshold: 0.85)
        - bank_accounts.iban (weight: 0.9, exact_match)
        - addresses.postal_code + addresses.street (weight: 0.6, fuzzy_match)
      auto_merge_threshold: 0.95
      review_threshold: 0.75
      
    # Golden record survivorship rules
    golden_record:
      legal_name: prefer(source: dun_bradstreet, then: most_recent)
      address: prefer(source: vendor_confirmed, then: most_recent)
      bank_accounts: prefer(source: vendor_confirmed, require: dual_verification)
      credit_rating: prefer(source: credit_agency, refresh: quarterly)
```

#### 2.2.4 Entity Graph Operations

| Operation | Description |
|-----------|-------------|
| **create(entity)** | Create a new entity. Runs identity resolution. Emits entity_created event. |
| **relate(source, target, type, attrs)** | Create a relationship. Validates schema. Emits relationship_created event. |
| **query(type, filters, depth?)** | Query entities by type and attributes, optionally traversing relationships. |
| **traverse(entity_id, relationship_types, depth)** | Graph traversal from a starting entity. |
| **resolve_identity(candidate)** | Run identity resolution against existing entities. Returns match candidates. |
| **golden_record(entity_id)** | Compute the golden record projection for an entity across all scopes. |

All mutations emit events. The entity graph's current state is itself a projection of entity-related events.

#### 2.2.5 Schema Extension Model

Any tenant can extend entity schemas without affecting the core:

```yaml
entity_extensions:
  context: tenant_acme_corp
  
  - entity_type: vendor
    additional_attributes:
      - name: diversity_certification
        data_type: enum
        values: [none, mbe, wbe, sdvosb, hubzone, 8a]
        required: false
        indexed: true
        
      - name: sustainability_score
        data_type: decimal
        range: [0, 100]
        required_when:
          rule: vendor.annual_spend > 100000
          
      - name: strategic_tier
        data_type: enum
        values: [strategic, preferred, approved, conditional, blocked]
        default: approved
        
    additional_relationships:
      - type: sustainability_assessment
        target: sustainability_assessment_entity
        cardinality: one_to_many
```

Extensions are first-class — they participate in rules, projections, security, and agent capabilities identically to core attributes.

---

### 2.3 Rules Engine

The rules engine evaluates declarative condition-action rules against events, intents, and entity state. It replaces parameter forms, hardcoded business logic, and workflow configuration.

#### 2.3.1 Rule Structure

```typescript
interface Rule {
  // Identity
  id: string;                    // Unique rule identifier
  name: string;                  // Human-readable name
  description: string;           // What this rule does and why
  
  // Classification
  category: "business" | "regulatory" | "security" | "validation" | "automation" | "custom";
  module: string;                // Which capability module this belongs to
  
  // Versioning
  version: number;
  effective_from: Date;
  effective_to?: Date;
  supersedes?: string;           // Previous version's rule ID
  
  // Scope
  scope: {
    jurisdictions?: string[];    // For regulatory rules
    legal_entities?: string[];   // For entity-specific rules
    tenant?: string;             // For custom rules
  };
  
  // Condition
  when: RuleCondition;           // Declarative condition expression
  
  // Action
  then: RuleAction[];            // One or more actions to take
  
  // Failure handling
  on_failure?: RuleAction[];     // What to do if condition fails (for validation rules)
  
  // Metadata
  authority?: string;            // For regulatory rules: which authority requires this
  testable: boolean;             // Can be simulated against historical data
  tags: string[];
}
```

#### 2.3.2 Rule Condition Language

Rules use a declarative expression language that is both human-readable and machine-evaluable:

```
# Simple conditions
event.type == "invoice_submitted"
event.amount > 10000
vendor.status == "approved"

# Compound conditions
event.type == "invoice_submitted" 
  AND event.amount > 10000 
  AND vendor.tier != "strategic"

# Temporal conditions
days_since(vendor.last_bank_verification) > 365
event.timestamp.hour NOT IN [8..18]  # outside business hours

# Aggregation conditions
sum(events.type: "payment", vendor: event.vendor, period: "current_month") > 100000

# Relationship traversal
event.submitter.manager.department == "finance"
vendor.relationships.supplies_to(entity: current_legal_entity).credit_limit > event.amount

# Pattern matching
count(events.type: "invoice_submitted", vendor: event.vendor, period: "last_7_days") > 
  3 * avg(events.type: "invoice_submitted", vendor: event.vendor, period: "monthly", lookback: 6)
```

#### 2.3.3 Rule Actions

```yaml
# Available action types
actions:
  # Flow control
  - approve                      # Auto-approve an intent
  - reject(reason)               # Reject with explanation
  - require_approval(from, sla)  # Route for approval
  - escalate(to, reason)         # Escalate to higher authority
  - hold(reason, release_condition)  # Hold for condition
  
  # Data operations
  - emit_event(type, data)       # Create a new event
  - enrich_event(fields)         # Add data to the current event
  - create_entity(type, attrs)   # Create a new entity
  - create_relationship(type, source, target)
  
  # Computation
  - calculate(expression, store_as)  # Compute a value
  - allocate(method, basis, targets) # Cost/revenue allocation
  - apply_tax(jurisdiction, rules)   # Tax calculation
  
  # Notification
  - notify(recipients, template)  # Send notification
  - alert(severity, message)      # System alert
  - flag(category, details)       # Flag for review
  
  # Agent
  - suggest(to_agent, intent)    # Suggest action to an agent
  - request_agent_review(agent, context)  # Ask agent to evaluate
```

#### 2.3.4 Rule Evaluation

When an event is emitted or an intent is expressed, the rules engine:

1. **Identifies applicable rules** — based on event type, scope, jurisdiction, and effective dates
2. **Evaluates conditions** — in priority order (regulatory > security > business > custom)
3. **Executes actions** — for all rules whose conditions are met
4. **Records evaluation** — which rules were evaluated, which fired, which didn't, and why
5. **Returns trace** — complete explanation of the evaluation for audit and debugging

```typescript
interface RuleEvaluation {
  event_or_intent_id: string;
  timestamp: DateTime;
  rules_considered: number;
  rules_evaluated: {
    rule_id: string;
    rule_name: string;
    condition_result: boolean;
    condition_explanation: string;  // Human-readable: "amount $12,000 > threshold $10,000"
    actions_taken: string[];
    execution_time_ms: number;
  }[];
  final_disposition: string;       // "approved" | "requires_approval" | "rejected" | etc.
}
```

#### 2.3.5 Rule Management

Rules are version-controlled and testable:

```yaml
rule_management:
  storage: git_backed
  
  operations:
    - create: define new rule with effective_from date
    - update: creates new version, old version gets effective_to date
    - test: simulate rule against historical events (returns what-if analysis)
    - compare: diff two rule versions
    - impact_analysis: estimate how many future events would be affected
    - disable: set effective_to to now (rule stops evaluating, preserved in history)
    
  governance:
    regulatory_rules:
      modify_requires: role:compliance_officer
      review_before_activation: mandatory
      
    security_rules:
      modify_requires: role:security_admin
      
    business_rules:
      modify_requires: role:business_admin OR capability:manage_rules
      
    custom_rules:
      modify_requires: tenant_admin
      sandboxed: true  # cannot affect other tenants
```

---

### 2.4 Projection Engine

The projection engine maintains materialized read models computed from the event stream. Projections replace traditional database queries, reports, and batch-computed aggregations.

#### 2.4.1 Projection Definition

```typescript
interface ProjectionDefinition {
  // Identity
  id: string;
  name: string;
  description: string;
  
  // Source
  source_events: string[];       // Event types this projection consumes
  
  // Partitioning
  partitioned_by: string[];      // Scope dimensions for data isolation
  // e.g., ["legal_entity", "division"] means each entity+division combo gets its own projection
  
  // Refresh strategy
  refresh: "real_time" | "near_real_time" | "scheduled";
  refresh_config: {
    delay_ms?: number;           // For near_real_time: max acceptable lag
    schedule?: string;           // For scheduled: cron expression
    cache_ttl?: string;          // How long cached results are valid
  };
  
  // Schema
  output_schema: Record<string, any>;  // The shape of the projected data
  
  // Projector function
  projector: {
    type: "declarative" | "code";
    definition: string;          // Declarative projection rules or function reference
  };
  
  // Retention
  retention: {
    snapshots: string;           // How long to keep point-in-time snapshots
    history: boolean;            // Whether to maintain historical values
  };
}
```

#### 2.4.2 Core System Projections

The system maintains these projections as part of the core engine:

```yaml
core_projections:
  # Financial
  - name: gl_trial_balance
    source_events: [journal_posted, allocation_posted, revaluation_posted]
    partitioned_by: [legal_entity]
    refresh: real_time
    output: account_balances by period, with dimensional breakdown
    supports: drill_down to source events
    
  - name: gl_balance_sheet
    derived_from: gl_trial_balance
    applies: account_hierarchy (balance_sheet_structure)
    
  - name: gl_income_statement
    derived_from: gl_trial_balance
    applies: account_hierarchy (income_statement_structure)
    
  - name: ap_subledger
    source_events: [invoice_*, payment_*, credit_memo_*]
    partitioned_by: [legal_entity, division]
    refresh: real_time
    output: vendor_balances, aging_buckets, open_items
    
  - name: ar_subledger
    source_events: [billing_*, receipt_*, credit_*]
    partitioned_by: [legal_entity, division]
    refresh: real_time
    output: customer_balances, aging_buckets, open_items
    
  # Inventory
  - name: inventory_on_hand
    source_events: [receipt_*, issue_*, transfer_*, adjustment_*]
    partitioned_by: [legal_entity, site]
    refresh: real_time
    output: quantity_by_item_by_location, valuation_by_costing_method
    
  - name: inventory_expected
    source_events: [purchase_order_confirmed, production_order_released, transfer_order_created]
    partitioned_by: [legal_entity, site]
    refresh: real_time
    output: expected_receipts by item, date, source
    
  # Supply Chain
  - name: demand_supply_balance
    source_events: [sales_order_*, forecast_*, purchase_order_*, production_order_*, transfer_*]
    partitioned_by: [legal_entity, site]
    refresh: real_time
    output: net_requirements by item, date, coverage_group
    
  # Operational
  - name: entity_current_state
    source_events: [entity_created, entity_modified, relationship_*]
    partitioned_by: [scope]
    refresh: real_time
    output: current entity attributes and relationships
    
  # Audit
  - name: audit_trail
    source_events: [all]
    partitioned_by: [legal_entity]
    refresh: real_time
    output: complete event lineage with rule evaluations
    retention: regulatory_minimum (7+ years)
```

#### 2.4.3 Projection Operations

| Operation | Description |
|-----------|-------------|
| **query(projection, filters, dimensions?)** | Query a projection with optional dimensional slicing. |
| **snapshot(projection, as_of)** | Get projection state at a specific point in time. |
| **compare(projection, period_a, period_b)** | Compare two time periods. |
| **drill_down(projection, cell, depth)** | Drill from a projection value to underlying events. |
| **fork(projection, scenario_name)** | Create a simulation fork for what-if analysis. |
| **rebuild(projection, from?)** | Rebuild a projection from events (for schema changes or corrections). |

#### 2.4.4 Simulation (What-If)

The projection engine supports forking for scenario analysis:

```yaml
simulation:
  operation: fork
  base_projection: gl_income_statement
  scenario: "extend_vendor_payment_terms_to_60_days"
  
  hypothetical_events:
    - modify: all events where type == "payment_executed"
      change: payment_date += 30 days
      
  compute: 
    - cash_position_impact
    - interest_expense_change
    - vendor_discount_lost
    
  compare_to: base_projection
  output: variance_analysis
```

---

### 2.5 Intent Protocol

The intent protocol is the universal entry point for all actions in the system. Every actor (human, agent, external system) expresses intents that are resolved through the rules engine into events.

#### 2.5.1 Intent Structure

```typescript
interface Intent {
  // Identity
  id: string;                    // Unique intent ID
  type: string;                  // Intent type (e.g., "procure_materials", "submit_invoice")
  
  // Actor
  actor: {
    type: "human" | "agent" | "system" | "external";
    id: string;
    on_behalf_of?: string;
    session_context?: any;       // UI context, conversation context, etc.
  };
  
  // What
  goal: string;                  // Natural language description of the goal
  parameters: Record<string, any>;  // Structured parameters for the intent
  constraints?: Record<string, any>;  // Constraints on how the intent should be resolved
  preferences?: Record<string, any>;  // Soft preferences (may be overridden)
  
  // Organizational Context
  scope: {
    legal_entity: string;
    division?: string;
    [key: string]: string;
  };
  
  // Lifecycle
  status: "received" | "validating" | "planning" | "awaiting_approval" | 
          "approved" | "executing" | "completed" | "rejected" | "failed";
  
  // Resolution
  resolution?: {
    plan: PlannedAction[];       // What the system plans to do
    rules_applied: string[];     // Which rules influenced the plan
    approval_required: boolean;  // Whether human approval is needed
    approval_chain?: ApprovalStep[];
    estimated_impact?: any;      // Projected impact of execution
  };
  
  // Tracing
  reasoning?: string;            // For agent intents: why the agent expressed this
  confidence?: number;           // For agent intents: confidence in the approach
}
```

#### 2.5.2 Intent Resolution Pipeline

Every intent flows through this pipeline:

```
RECEIVE → AUTHENTICATE → AUTHORIZE → VALIDATE → PLAN → APPROVE? → EXECUTE → CONFIRM
```

**Stage 1: Receive**
- Parse the intent (from NL, API, or structured protocol)
- Assign ID and timestamp
- Classify intent type

**Stage 2: Authenticate**
- Verify actor identity
- Establish delegation chain if applicable

**Stage 3: Authorize**
- Check actor's capabilities against intent type
- Check scope permissions
- Check agent boundaries (if agent)
- Reject if unauthorized

**Stage 4: Validate**
- Evaluate validation rules against intent parameters
- Check entity references exist and are active
- Validate dimensional context
- Check budget availability (if applicable)
- Return to actor with validation failures and suggestions

**Stage 5: Plan**
- Resolve intent into specific planned actions (events to emit)
- Apply business rules to determine execution details
- Optimize execution (consolidation, routing, timing)
- Compute estimated impact

**Stage 6: Approve (conditional)**
- Evaluate approval rules
- If no approval needed: proceed
- If approval needed: route to approval chain
- Support parallel approvals, conditional approvals, delegation
- Enforce SLA with escalation

**Stage 7: Execute**
- Emit planned events
- Update projections
- Trigger downstream intents (if rules dictate)
- Notify relevant parties

**Stage 8: Confirm**
- Return execution result to actor
- Include full trace (rules applied, events emitted, projections updated)

#### 2.5.3 Intent Types Registry

Intent types are registered by capability modules:

```yaml
intent_registry:
  # Finance intents
  - type: submit_journal_entry
    module: general_ledger
    parameters:
      required: [lines, description, effective_date]
      optional: [reversal_date, recurring_schedule]
    resolution: creates journal_posted events
    
  - type: submit_invoice
    module: accounts_payable
    parameters:
      required: [vendor, amount, invoice_number, invoice_date]
      optional: [po_reference, lines, attachments]
    resolution: creates invoice_submitted event, triggers matching
    
  # Procurement intents
  - type: procure_materials
    module: procurement
    parameters:
      required: [items_or_categories, quantity_or_amount]
      optional: [vendor, need_by_date, budget_reference, constraints]
    resolution: may create purchase_order_created event, or negotiate with vendors
    
  # Natural language intents
  - type: natural_language
    module: core
    parameters:
      required: [utterance]
      optional: [context]
    resolution: parsed by NL engine into typed intent, then re-evaluated
```

---

## 3. Agent Framework

Agents are first-class participants in the system with identity, capabilities, boundaries, and trust levels.

### 3.1 Agent Identity & Lifecycle

```yaml
agent_definition:
  # Identity
  id: string                     # Unique agent identifier
  name: string                   # Human-readable name
  description: string            # What this agent does
  owner: string                  # Human identity responsible for this agent
  
  # Lifecycle
  status: "draft" | "testing" | "active" | "suspended" | "retired"
  created_at: DateTime
  activated_at: DateTime
  last_active: DateTime
  
  # Delegation
  delegated_from: string         # Role or identity this agent acts on behalf of
  delegation_scope: string       # Full delegation or subset
  
  # Runtime
  runtime: "internal" | "external"
  schedule: "continuous" | "event_driven" | "scheduled"
  model: string                  # AI model identifier (if applicable)
```

### 3.2 Capabilities & Boundaries

```yaml
agent_capabilities:
  agent_id: procurement_optimizer
  
  # What it can do
  can_express_intents:
    - procure_materials
    - adjust_safety_stock
    - negotiate_with_vendor (a2a)
    - suggest_vendor_consolidation
    
  can_read:
    - inventory_positions (projection)
    - vendor_performance (projection)
    - demand_supply_balance (projection)
    - vendor entities (within scope)
    - item entities (within scope)
    
  can_subscribe_to:
    - demand_signal_created
    - inventory_below_reorder_point
    - vendor_delivery_delayed
    - price_change_detected
    
  # What it cannot do
  cannot:
    - modify_vendor_master
    - access_pii_fields
    - override_approval_decisions
    - access_entities_outside_scope
    
  # Boundaries
  boundaries:
    max_po_value: 35000
    max_daily_spend: 150000
    max_concurrent_negotiations: 10
    vendor_scope: approved_vendors_only
    item_scope: configured_item_groups
    
    requires_human_approval_when:
      - single_source_award > 50000
      - new_vendor_selection
      - contract_term > 12_months
      - outside_normal_price_range (> 2_std_dev)
```

### 3.3 Trust Levels

```yaml
trust_levels:
  - level: suggest_only
    description: "Agent suggests actions, human must execute"
    behavior: 
      - express intents with status "suggestion"
      - no automatic execution
      - all suggestions logged
    use_when: "New agents, high-risk domains, low confidence"
    
  - level: approve_then_execute
    description: "Agent plans actions, human approves, system executes"
    behavior:
      - express intents fully
      - execution held for human approval
      - approval SLA enforced
    use_when: "Established agents, moderate-risk actions"
    
  - level: autonomous_with_logging
    description: "Agent executes within boundaries, all actions logged for review"
    behavior:
      - express and execute intents within boundaries
      - full audit trail
      - periodic human review of agent decisions
      - anomaly detection on agent behavior
    use_when: "Trusted agents, routine operations within boundaries"
    
  - level: fully_autonomous
    description: "Agent operates independently within boundaries"
    behavior:
      - express and execute intents within boundaries
      - logging for audit only
      - human intervention only on boundary violations or escalations
    use_when: "Highly trusted agents, well-defined routine tasks"
```

### 3.4 Agent Collaboration

```yaml
collaboration_patterns:
  # Claim-based coordination
  claim_protocol:
    - agent detects actionable event (e.g., demand signal)
    - agent emits "claim" event for that signal
    - other agents see claim, avoid duplicate work
    - if claiming agent fails/times out, claim expires
    - another agent can then claim
    
  # Escalation
  escalation_protocol:
    - agent hits boundary or uncertainty threshold
    - agent emits escalation event with:
        - context: what was being done
        - reasoning: why escalation is needed
        - recommendation: what the agent would do if authorized
        - confidence: how confident the agent is
    - escalation routed to human or higher-trust agent
    
  # Negotiation (internal)
  internal_negotiation:
    - two agents with competing objectives propose plans
    - system surfaces trade-off analysis
    - human or arbitration agent resolves
    - resolution is an event with full rationale
```

### 3.5 Agent-to-Agent (A2A) — Cross-Enterprise

```yaml
a2a_framework:
  # Trust establishment
  trust_setup:
    - organizations establish trust via verified identity (DUNS, certificates)
    - agent capabilities are attested and verified
    - interaction rules defined per partner
    
  # Negotiation protocol
  negotiation:
    message_types:
      - request_for_quote (rfq)
      - offer
      - counter_offer
      - accept
      - reject
      - withdraw
      - escalate_to_human
      
    rfq_structure:
      item_or_spec: required
      quantity: required
      need_by_date: required
      constraints: optional (quality, certifications, sustainability)
      preferences: optional (optimize_for, preferred_terms)
      
    offer_structure:
      unit_price: required
      delivery_date: required
      quantity: required (may be partial)
      terms: required
      validity_period: required
      confidence: required
      reasoning: optional (helps buyer evaluate)
      alternate_offers: optional
      
  # Coordination patterns
  multi_party:
    - supply_chain_disruption: agent coordinates with multiple vendor agents + logistics + internal production
    - collaborative_forecasting: buyer and supplier agents share demand signals (within agreed visibility)
    - vendor_managed_inventory: supplier agent monitors buyer's inventory and proactively replenishes
```

---

## 4. Governance Layer

### 4.1 Security Model

Security is evaluated at the intent level and enforced structurally through scope partitioning.

#### 4.1.1 Identity

Every actor in the system has an identity:

```yaml
identity_types:
  - type: human
    authentication: sso + mfa
    attributes: [name, email, department, manager, roles]
    
  - type: agent
    authentication: service_certificate
    attributes: [name, owner, trust_level, capabilities, boundaries]
    
  - type: external_system
    authentication: mutual_tls + api_key
    attributes: [name, organization, scope_restriction]
    
  - type: external_auditor
    authentication: federated_identity
    attributes: [firm, engagement, scope, expiry]
```

#### 4.1.2 Intent Authorization

Every intent is authorized before processing:

```
Authorization check:
  1. Is the actor authenticated? → If no: reject
  2. Does the actor have a capability that covers this intent type? → If no: reject
  3. Is the intent within the actor's scope? → If no: reject
  4. Are the intent's parameters within the actor's boundaries? → If no: reject or escalate
  5. Are there any conditional restrictions? → Evaluate conditions
  6. Segregation of duties check: has this actor touched related entities in a conflicting way? → If yes: reject
```

#### 4.1.3 Field-Level Security

```yaml
field_masking:
  - entity_type: vendor
    field: bank_accounts
    visible_to: [capability: vendor_bank_access]
    masked_as: "****XXXX" (last 4 digits)
    
  - entity_type: vendor
    field: tax_id
    visible_to: [capability: vendor_tax_access]
    masked_as: "***-**-XXXX" (last 4 digits)
    
  - entity_type: employee
    field: salary
    visible_to: [capability: payroll_access, self]
    masked_as: hidden
```

### 4.2 Record-Level Security & Scopes

#### 4.2.1 Scope Dimensions

```yaml
security_scopes:
  dimensions:
    - name: legal_entity
      hierarchy: [corporate_group, legal_entity]
      inheritance: downward
      primary_partition: true     # Physical data partitioning key
      
    - name: division
      hierarchy: [corporation, division, department]
      inheritance: downward
      
    - name: region
      hierarchy: [global, region, country, site]
      inheritance: downward
      
    - name: project
      hierarchy: flat
      inheritance: none           # Explicit assignment only
```

#### 4.2.2 Scope Enforcement

Data isolation is structural — not filtered at query time:

```yaml
scope_enforcement:
  mechanism: projection_partitioning
  
  # Each scope combination gets its own projection partition
  # A Division A user's trial balance projection ONLY contains Division A events
  # There is no "filter" to bypass — the data is structurally separated
  
  cross_scope_access:
    type: scope_elevation
    requires: explicit_authorization
    audit: all_access_logged
    
    examples:
      - type: consolidation
        combines: all divisions
        requires: role:corporate_controller
        
      - type: cross_division_transfer
        combines: source + target division
        requires: approval_from_both_divisions
        
      - type: shared_master_data
        visibility: global (but interaction history is scoped)
```

#### 4.2.3 Scope Assignment

```yaml
scope_policies:
  - identity: role:division_a_controller
    visible_scopes:
      legal_entity: [USMF]
      division: [division_a]
      region: [all]              # Cross-region within their division
      
  - identity: role:cfo
    visible_scopes:
      legal_entity: [all]
      division: [all]
      region: [all]
      
  - identity: agent:division_a_procurement
    visible_scopes:
      legal_entity: [USMF]
      division: [division_a]
    note: "Agent cannot request scope elevation"
```

### 4.3 Roles, Duties & Capabilities

#### 4.3.1 Capability Definitions

Capabilities are atomic business permissions:

```yaml
capabilities:
  - id: enter_vendor_invoice
    intent_types: [submit_invoice]
    entity_access:
      read: [vendors, purchase_orders, goods_receipts, items]
      write: [invoice_events]
    description: "Enter and submit vendor invoices for processing"
      
  - id: approve_vendor_invoice
    intent_types: [approve_invoice]
    entity_access:
      read: [invoices, matching_results, vendor_details, budgets]
      write: [approval_events]
    description: "Review and approve vendor invoices"
      
  - id: execute_payment
    intent_types: [execute_payment_run, approve_payment_proposal]
    entity_access:
      read: [approved_invoices, bank_accounts, payment_terms]
      write: [payment_events]
    description: "Execute vendor payments"
```

#### 4.3.2 Duty Definitions with Segregation

```yaml
duties:
  - id: ap_processing
    capabilities: [enter_vendor_invoice, perform_invoice_matching, query_vendors]
    segregation:
      conflicts_with: [ap_approval, payment_execution, vendor_master_maintenance]
      
  - id: ap_approval
    capabilities: [approve_vendor_invoice, view_invoice_details, query_budgets]
    segregation:
      conflicts_with: [ap_processing, payment_execution]
      
  - id: payment_execution
    capabilities: [execute_payment, view_bank_accounts, perform_bank_reconciliation]
    segregation:
      conflicts_with: [ap_approval, vendor_master_maintenance]
```

#### 4.3.3 Role Definitions

```yaml
roles:
  - id: ap_clerk
    duties: [ap_processing]
    scope_template: per_division
    conditions:
      max_invoice_amount: configurable_per_entity
      
  - id: ap_manager
    duties: [ap_approval, ap_reporting]
    scope_template: per_division_or_cross_division
    conditions:
      max_approval_amount: configurable_per_entity
      
  - id: controller
    duties: [gl_management, ap_approval, ar_management, financial_reporting, period_close]
    scope_template: per_legal_entity
```

#### 4.3.4 Segregation of Duties Enforcement

```yaml
sod_enforcement:
  timing: configuration_time   # Prevent violations, don't just detect
  
  on_role_assignment:
    - check all duties in new role against all duties in existing roles
    - if conflict found: REJECT assignment
    - offer alternatives: which duties would need to be removed
    
  on_duty_modification:
    - re-evaluate all identities with affected duty
    - flag any newly created conflicts
    
  exceptions:
    - require: compliance_officer_approval
    - must_define: compensating_control
    - auto_assign: enhanced_monitoring (continuous_auditor watches all actions)
    - expiry: mandatory, max 12 months, renewable with re-approval
    
  runtime_enforcement:
    - even with exception, check per-transaction:
      "has this user modified the vendor master for this vendor in last 24h?"
      → if yes, block invoice entry for that vendor
```

#### 4.3.5 Privilege Escalation

```yaml
escalation_policies:
  - type: temporary_elevation
    name: "Period close elevation"
    grants_duties: [period_close_management]
    to: role:senior_accountant
    trigger: period_close_event
    duration: 5_business_days
    requires: controller_approval
    logging: enhanced
    auto_revoke: true
    
  - type: break_glass
    name: "Emergency access"
    grants_duties: [controller_duties]
    to: designated_backup_list
    trigger: manual_request
    requires: cfo + compliance_officer
    duration: 24_hours
    logging: maximum
    post_review: mandatory_48h
```

### 4.4 Privacy Engine

```yaml
privacy:
  pii_classification:
    personal_identifier: [name, tax_id, national_id, passport]
    contact_info: [email, phone, address]
    financial: [bank_account, credit_card, salary]
    sensitive: [health_info, biometric, political_affiliation]
    
  data_subject_rights:
    right_to_access:
      - query entity graph for all entities linked to data subject
      - generate complete data access report
      - automated, self-service via portal
      
    right_to_deletion:
      - identify all PII fields across all entities for data subject
      - apply retention rules (some data must be kept for regulatory reasons)
      - redact PII fields that are past retention
      - preserve event skeleton for audit integrity
      - emit deletion_executed event for compliance record
      
    right_to_portability:
      - export all data subject's data in standard format
      - include entity attributes and event history
      
  consent_management:
    - per entity attribute with pii_class
    - consent recorded as event (consent_granted, consent_revoked)
    - processing gated on active consent where required
    
  data_residency:
    - scope-level configuration for storage jurisdiction
    - event routing respects residency rules
    - cross-border transfer requires explicit data transfer agreement
```

### 4.5 Audit Engine

```yaml
audit:
  # Inherent in event store — no separate audit log needed
  
  event_lineage:
    every_event_records:
      - who: actor identity with full authentication context
      - what: event type and data
      - when: timestamp with timezone
      - where: scope context
      - why: intent_id, caused_by chain, rules_evaluated
      - how: which capabilities were exercised, which boundaries were checked
      
  continuous_controls:
    agent: continuous_auditor (always active, read-only)
    monitors:
      - segregation_of_duties_violations
      - unusual_transaction_patterns
      - access_anomalies
      - completeness_checks (every PO has receipt, every receipt has invoice)
      - timeliness_checks (processing times, approval SLAs)
      
  audit_projections:
    - sox_controls_evidence (real-time)
    - revenue_recognition_trail (real-time)
    - journal_entry_analysis (all manual entries with authorization chain)
    - vendor_master_change_log (with dual approval verification)
    - user_access_review_package (current permissions by identity)
    
  auditor_access:
    - type: read_only, scoped, time_limited
    - self_service: drill from financial statement to source event
    - evidence_generation: automated compliance packages
    - no_dependency: on system users to pull reports
```

---

## 5. Organizational Model

### 5.1 Multi-Legal Entity

Legal entities are nodes in the organizational graph with their own event streams, configurations, and scope partitions.

```yaml
organizational_graph:
  - entity: corporate_group
    type: group
    children:
      - entity: legal_entity_1
        type: legal_entity
        jurisdiction: US
        functional_currency: USD
        fiscal_calendar: us_standard
        chart_of_accounts: us_gaap_projection_config
        registrations: [tax_id, state_registrations]
        
      - entity: legal_entity_2
        type: legal_entity
        jurisdiction: GB
        functional_currency: GBP
        chart_of_accounts: uk_frs102_projection_config
        registrations: [company_number, vat_number]
        
    shared_services:
      - entity: shared_services_unit
        type: operating_unit
        purpose: centralized_functions
```

#### 5.1.1 Configuration Inheritance

```yaml
configuration_inheritance:
  model: group → legal_entity (with override)
  
  group_defaults:
    payment_terms: [net30, net45, net60]
    approval_thresholds: {po: 50000, journal: 25000}
    vendor_evaluation_criteria: [quality, delivery, cost]
    
  entity_overrides:
    legal_entity_1:
      approval_thresholds: {po: 75000}  # higher for this entity
      # everything else inherited
      
    legal_entity_2:
      payment_terms: [net30, net60, skonto_2_14]  # German conventions
      extends:
        mandatory_fields:
          invoice: [vat_number]
```

#### 5.1.2 Intercompany

Intercompany is event choreography — two causally linked events in two scope partitions:

```yaml
intercompany:
  mechanism: causally_linked_event_pairs
  
  flow:
    1. source_entity emits intercompany event (e.g., intercompany_sale)
    2. system auto-generates mirror event in target_entity scope
    3. events are causally linked (event_2.caused_by = event_1.id)
    4. fx_rate captured at event time, immutable
    5. intercompany balances are always reconcilable (matched pairs)
    
  elimination:
    mechanism: consolidation_projection_rule
    auto_matched: through causal links
    no_manual_reconciliation_needed: true
```

#### 5.1.3 Consolidation

Consolidation is a real-time projection, not a batch process:

```yaml
consolidation:
  type: projection
  source: all subsidiary event streams
  reporting_currency: configurable
  
  rules:
    currency_translation:
      balance_sheet: closing_rate
      income_statement: average_rate
      equity: historical_rate
      
    intercompany_elimination:
      auto_match: through causal_links
      eliminate: [ic_receivable↔ic_payable, ic_revenue↔ic_cogs]
      
    minority_interest:
      per_subsidiary: ownership_percentage and method
      
  refresh: real_time
  multiple_views: [us_gaap, ifrs, management]  # from same events
```

### 5.2 Financial Dimensions

Dimensions are attributes of events, not of accounts.

#### 5.2.1 Dimension Definitions

```yaml
dimension_definitions:
  - name: department
    hierarchy:
      levels: [division, department, team]
    source: organizational_graph
    required_on: all_financial_events
    
  - name: cost_center
    hierarchy:
      levels: [cost_center_group, cost_center]
    source: cost_center_entities
    required_on: expense_events
    
  - name: project
    hierarchy:
      levels: [program, project, work_package]
    source: project_entities
    required_on: when_event_relates_to_project
    
  # New dimensions can be added without schema changes
  # They're just new attribute types on events
```

#### 5.2.2 Dimension Defaults & Inheritance

```yaml
dimension_defaults:
  - entity_type: employee
    defaults: {department, cost_center, region}
    # Auto-populates on expense events
    
  - entity_type: vendor
    defaults_per_scope:
      per_legal_entity: {cost_center, default_account}
    # Auto-populates on invoice events
    
  - entity_type: warehouse
    defaults: {region, cost_center}
    # Auto-populates on inventory events
    
  inheritance_chain:
    # Dimensions cascade through related events:
    # project → PO → receipt → invoice → payment → GL
    # Override possible at any step, but default is inherit
```

#### 5.2.3 Dimension Validation

```yaml
dimension_validation:
  # Replaces rigid "account structures" with flexible rules
  - rule: "Engineering depts use engineering cost centers"
    when: event.department STARTS_WITH "ENG"
    validate: event.cost_center IN engineering_cost_centers
    on_violation: reject_with_suggestion
    
  - rule: "Capital projects require asset category"
    when: event.project.type == "capital"
    validate: event.asset_category IS NOT NULL
    on_violation: prompt_for_input
```

#### 5.2.4 Posting Rules

The GL impact of events is derived from rules, not manually specified:

```yaml
posting_rules:
  - when: event.type == "expense_submitted" AND event.category == "travel"
    then:
      debit:
        account: 6200  # Travel & Entertainment
        dimensions: inherit_from_event [department, cost_center, project]
      credit:
        account: 2100  # AP / Expense payable
        dimensions: inherit_from_event [department]
        
  - when: event.type == "goods_receipt_posted"
    then:
      debit:
        account: determine_by_rule(item.item_group → account_mapping)
        dimensions: inherit_from_event [cost_center, project]
      credit:
        account: goods_received_not_invoiced
        dimensions: inherit_from_event [cost_center]
```

### 5.3 Number Sequences

```yaml
number_sequences:
  model: per_legal_entity, per_document_type
  
  definition:
    - scope: legal_entity:USMF
      document_type: purchase_order
      pattern: "PO-{YYYY}-{######}"
      next: auto_increment
      
    - scope: legal_entity:USMF
      document_type: vendor_invoice
      pattern: "INV-{YYYY}-{######}"
      next: auto_increment
      
  features:
    - gap-free: configurable (required for some regulatory contexts)
    - pre-allocation: for performance (batch of numbers pre-allocated)
    - fiscal_year_reset: optional
```

---

## 6. Business Capabilities

Each business capability is a module that registers entity schemas, event types, intent types, rules, and projections with the core engine.

### 6.1 General Ledger

```yaml
module: general_ledger

entity_schemas:
  - type: account
    attributes: [number, name, type(asset|liability|equity|revenue|expense), 
                 category, is_active, currency_type(single|any)]
                 
  - type: account_hierarchy
    description: "Defines P&L and BS structure as projection configuration"
    attributes: [name, purpose(reporting|regulatory|management), 
                 structure(tree of account ranges)]
                 
  - type: fiscal_calendar
    attributes: [name, year_start, period_definitions]

event_types:
  - journal_submitted
  - journal_approved
  - journal_posted
  - allocation_computed
  - revaluation_computed
  - period_opened
  - period_closed
  - period_reopened

intent_types:
  - submit_journal_entry
  - approve_journal_entry
  - perform_allocation
  - perform_revaluation
  - open_period
  - close_period

projections:
  - gl_trial_balance (real_time, partitioned by legal_entity)
  - gl_balance_sheet (derived from trial_balance + hierarchy)
  - gl_income_statement (derived from trial_balance + hierarchy)
  - gl_budget_vs_actual (trial_balance vs budget events)

key_rules:
  - balanced_entry: every journal must have equal debits and credits
  - period_control: events must post to open periods
  - budget_control: optional warning/hard stop on budget exceeded
  - auto_reversal: accrual entries auto-reverse in next period
```

### 6.2 Accounts Payable

```yaml
module: accounts_payable

entity_schemas:
  - type: vendor (extends base party entity)
  - type: payment_terms
  - type: vendor_group
  - type: vendor_bank_account

event_types:
  - invoice_received
  - invoice_submitted
  - invoice_matched (2-way or 3-way)
  - invoice_match_exception
  - invoice_approved
  - invoice_posted
  - credit_memo_received
  - payment_proposal_generated
  - payment_proposal_approved
  - payment_executed
  - payment_confirmed
  - vendor_bank_verified
  - early_payment_discount_captured
  - early_payment_discount_lost

intent_types:
  - submit_invoice
  - match_invoice
  - resolve_match_exception
  - approve_invoice
  - generate_payment_proposal
  - approve_payment_proposal
  - execute_payment

projections:
  - ap_subledger (real_time: open items, aging, balances)
  - ap_aging (near_real_time: aging buckets by vendor, division)
  - payment_forecast (scheduled: cash outflow predictions)
  - vendor_spend_analysis (scheduled: spend by vendor, category, period)
  - discount_capture_analysis (near_real_time: captured vs lost discounts)

key_rules:
  - three_way_match: PO qty/price vs receipt qty vs invoice qty/price
  - tolerance: configurable match tolerance per legal entity
  - duplicate_detection: vendor + invoice_number + amount + date
  - approval_routing: based on amount, vendor tier, exception type
  - payment_terms_calculation: due date, discount date, discount amount
  - withholding_tax: jurisdiction-specific tax withholding rules
  - 1099_tracking: US-specific vendor payment reporting
```

### 6.3 Accounts Receivable

```yaml
module: accounts_receivable

entity_schemas:
  - type: customer (extends base party entity)
  - type: customer_group
  - type: credit_limit_config

event_types:
  - sales_order_created
  - sales_order_confirmed
  - shipment_posted
  - sales_invoice_generated
  - free_text_invoice_created
  - customer_payment_received
  - customer_payment_applied
  - credit_memo_issued
  - write_off_posted
  - collection_letter_generated
  - interest_note_generated
  - credit_limit_exceeded_alert

intent_types:
  - create_sales_invoice
  - create_free_text_invoice
  - apply_payment
  - issue_credit_memo
  - process_write_off
  - generate_collection_letters

projections:
  - ar_subledger (real_time: open items, aging, balances)
  - ar_aging (near_real_time: aging buckets by customer)
  - cash_receipt_forecast (scheduled: expected inflows)
  - customer_credit_exposure (real_time: credit used vs limit)
  - dso_analysis (daily: days sales outstanding trending)
```

### 6.4 Procurement

```yaml
module: procurement

entity_schemas:
  - type: purchase_requisition
  - type: purchase_order
  - type: purchase_agreement (blanket orders / contracts)
  - type: vendor_catalog
  - type: sourcing_rule

event_types:
  - requisition_submitted
  - requisition_approved
  - rfq_created
  - rfq_response_received
  - purchase_order_created
  - purchase_order_confirmed
  - purchase_order_sent_to_vendor
  - purchase_order_acknowledged
  - purchase_order_changed
  - goods_receipt_posted
  - vendor_evaluated

intent_types:
  - submit_requisition
  - procure_materials
  - procure_services
  - create_rfq
  - evaluate_rfq_responses
  - create_purchase_order
  - confirm_purchase_order
  - receive_goods
  - evaluate_vendor

projections:
  - open_purchase_orders (real_time)
  - expected_deliveries (real_time)
  - committed_spend (real_time: by budget, dimension)
  - vendor_performance_scorecard (near_real_time)
  - procurement_savings_analysis (scheduled)
```

### 6.5 Inventory Management

```yaml
module: inventory_management

entity_schemas:
  - type: item (product master)
    attributes: [number, name, type(physical|service), item_group, 
                 unit_of_measure, costing_method, tracking_dimensions]
  - type: item_group
  - type: warehouse
  - type: location (within warehouse)
  - type: batch (for batch-tracked items)
  - type: serial_number (for serialized items)
  - type: inventory_dimension_group

event_types:
  - inventory_received
  - inventory_issued
  - inventory_transferred
  - inventory_adjusted
  - inventory_counted
  - inventory_revalued
  - quality_order_created
  - quality_test_completed

intent_types:
  - receive_inventory
  - issue_inventory
  - transfer_inventory
  - adjust_inventory
  - perform_count
  - revalue_inventory

projections:
  - inventory_on_hand (real_time: qty by item × location × batch × serial)
  - inventory_valuation (real_time: value by costing method)
  - inventory_aging (scheduled: age of stock by item)
  - inventory_turnover (scheduled: turns by item group)
  
costing_methods:
  supported: [fifo, lifo, weighted_average, standard, specific_identification]
  mechanism: projection over receipt/issue events with method-specific ordering
```

### 6.6 Warehouse Management

```yaml
module: warehouse_management

entity_schemas:
  - type: warehouse_layout (zones, aisles, racks, bins)
  - type: wave_template
  - type: work_template
  - type: location_directive
  - type: mobile_device_menu

event_types:
  - wave_created
  - wave_processed
  - work_created
  - work_assigned
  - work_started
  - work_completed
  - put_away_completed
  - pick_completed
  - pack_completed
  - ship_confirmed
  - location_replenishment_triggered

intent_types:
  - process_wave
  - assign_work
  - complete_pick
  - complete_put_away
  - confirm_shipment
  - replenish_location

projections:
  - warehouse_utilization (real_time: space used by zone)
  - work_queue (real_time: open work items by priority)
  - throughput_metrics (near_real_time: picks/hour, lines/hour)
```

### 6.7 Production Control

```yaml
module: production_control

entity_schemas:
  - type: bill_of_materials (BOM)
  - type: route (operations and resources)
  - type: production_order
  - type: resource (machines, labor)
  - type: resource_group

event_types:
  - production_order_created
  - production_order_estimated
  - production_order_released
  - production_order_started
  - operation_started
  - operation_completed
  - material_consumed
  - finished_good_reported
  - production_order_ended
  - production_variance_calculated

intent_types:
  - create_production_order
  - release_production_order
  - report_operation_complete
  - report_finished_goods
  - end_production_order

projections:
  - production_schedule (real_time: orders by status, date, resource)
  - resource_utilization (near_real_time: capacity used vs available)
  - production_variance (scheduled: standard vs actual cost analysis)
  - wip_valuation (real_time: work in progress by order)
```

### 6.8 Continuous Planning

Replaces MRP/MPS batch runs with a reactive demand/supply graph:

```yaml
module: continuous_planning

architecture:
  type: reactive_graph
  description: >
    Demand signals and supply signals exist as nodes in a reactive graph.
    When any signal changes, affected net requirements are recomputed
    in real-time. No batch MRP runs needed.

signal_types:
  demand_signals:
    - sales_order_lines
    - sales_forecasts
    - safety_stock_requirements
    - dependent_demand (from BOM explosion)
    - transfer_order_demand
    - minimum_inventory_levels
    
  supply_signals:
    - purchase_order_lines
    - production_order_output
    - transfer_order_supply
    - on_hand_inventory
    - planned_orders (system-generated)

computation:
  trigger: any_signal_change
  scope: affected_items_only (not full item/warehouse matrix)
  output: net_requirements by item × site × date
  
  when_net_requirement_negative:
    actions_per_coverage_rules:
      - coverage_group: make_to_stock
        action: generate_planned_production_order
      - coverage_group: purchase
        action: generate_planned_purchase_order
      - coverage_group: transfer
        action: generate_planned_transfer_order
        
  planned_order_resolution:
    automatic: if agent authorized and within boundaries
    suggest: if agent in suggest_only mode
    manual: if no agent configured

projections:
  - demand_supply_balance (real_time: net requirements by item × site)
  - planned_orders (real_time: system-suggested procurement/production)
  - supply_coverage (real_time: days of supply by item)
  - demand_forecast_accuracy (scheduled: forecast vs actual comparison)
```

### 6.9 Master Data Management

MDM is inherent in the entity graph, not a separate system:

```yaml
module: master_data_management

capabilities:
  identity_resolution:
    trigger: entity_creation or entity_import
    method: weighted multi-field matching
    outcomes: [auto_merge, review_required, no_match]
    
  golden_record:
    type: projection
    method: survivorship rules per attribute
    multiple_sources: unified through rules
    scope_aware: global attributes + per-entity local attributes
    
  data_quality:
    monitoring: continuous (event-driven)
    checks:
      - completeness (required fields populated)
      - freshness (last confirmed/updated)
      - consistency (cross-entity validation)
      - uniqueness (duplicate detection)
    scoring: per entity, per attribute
    
  lifecycle_management:
    statuses: [proposed, active, under_review, inactive, archived]
    transitions: governed by rules, produce events
    
  external_enrichment:
    sources: [dun_bradstreet, credit_agencies, tax_registries, sanctions_lists]
    method: continuous feed → events → golden record rules
    
  hierarchy_management:
    multiple_simultaneous: true
    types: [corporate_structure, sales_territory, pricing_group, risk_category]
    mechanism: relationship types in entity graph (not rigid trees)
```

---

## 7. Extensibility

### 7.1 Schema Extensions (No Code)

```yaml
extensibility_tier_1:
  mechanism: entity_schema_extension
  scope: per_tenant
  capabilities:
    - add attributes to any entity type
    - add relationship types
    - add validation rules
    - add dimension types
  governance: tenant_admin can create
  impact_on_core: none (extensions are first-class in the graph)
  upgrade_safe: yes (extensions are independent of core schema)
```

### 7.2 Custom Rules (Low Code)

```yaml
extensibility_tier_2:
  mechanism: custom_rules in rules_engine
  scope: per_tenant
  capabilities:
    - custom validation logic
    - custom approval routing
    - custom automation (if event → then action)
    - custom allocation methods
    - custom posting rules
  governance: business_admin can create, version-controlled
  testable: yes (simulate against historical events)
  impact_on_core: none (rules evaluate alongside standard rules)
  upgrade_safe: yes (declarative, engine-evaluated)
```

### 7.3 Custom Capabilities (Sandboxed Code)

```yaml
extensibility_tier_3:
  mechanism: sandboxed_capability_module
  scope: per_tenant
  capabilities:
    - custom computation (proprietary algorithms)
    - custom integration (niche industry systems)
    - custom UI components
  governance: system_admin + code_review
  sandbox:
    runtime: wasm_or_container
    can_only_interact_through: defined interfaces
    can_subscribe_to: specified event types
    can_emit: specified event types
    can_read: specified entity types and projections
    cannot: bypass rules engine, access storage directly, emit unauthorized events
    resource_limits: memory, cpu, execution_time, event_rate
```

---

## 8. Workflow & Approvals

Workflow is not a separate system — it's the intent resolution pipeline interacting with the rules engine.

```yaml
workflow:
  mechanism: intent_lifecycle_stages
  
  stages:
    - validate (automatic: rules engine)
    - approve (conditional: based on rules)
    - enrich (automatic: post-approval processing)
    - execute (automatic: emit events)
    
  approval_routing:
    determined_by: rules (same rules engine as everything else)
    supports:
      - threshold-based routing
      - dynamic routing (from org graph: submitter.manager)
      - parallel approvals
      - conditional branches
      - delegation (time-bound, audited)
      - SLA with escalation
      
  agent_aware:
    - agent intents include reasoning for approver review
    - "ask agent to reconsider" sends feedback to agent
    - agent-generated approvals include full context package
    
  no_separate_configuration:
    - approval logic is in rules
    - routing logic is in rules
    - escalation logic is in rules
    - all version-controlled, testable, traceable
```

---

## 9. Regulatory Compliance & Localization

### 9.1 Regulatory Rules

```yaml
regulatory_rules:
  structure: same as business rules, with additional metadata
  additional_fields:
    jurisdiction: required
    authority: required (which body requires this)
    effective_date: required
    supersedes: optional (previous version)
    
  management:
    versioned: yes (old transactions governed by old rules)
    testable: yes (simulate against historical data)
    shareable: yes (community/marketplace of rule packages)
    inspectable: yes (auditors can read the rules directly)
    
  statutory_reporting:
    mechanism: projections with regulatory rules applied
    types: [vat_returns, 1099, saf-t, intrastat, e-invoicing]
    always_current: projections, not batch runs
```

### 9.2 Localization Packs

```yaml
localization_packs:
  composable: yes (install multiple for multi-country operations)
  
  contents:
    - regulatory_rules: jurisdiction-specific
    - chart_of_accounts_template: local GAAP structure
    - document_adapters: local formats (e-invoicing, payment formats)
    - entity_extensions: locally required fields
    - workflow_templates: local business practice patterns
    - number_sequence_patterns: local conventions
    
  community_maintained: yes
  versioned: yes (tied to regulatory effective dates)
```

### 9.3 Document Adapters

```yaml
document_adapters:
  purpose: transform internal event/entity model to external formats
  
  types:
    invoice_output:
      - mexico: CFDI 4.0 (XML, digitally signed, PAC integration)
      - eu_peppol: UBL 2.1 (BIS Billing 3.0)
      - italy: FatturaPA (XML, SDI integration)
      - india: e-Invoice (JSON, IRP integration)
      - default: PDF (customizable template)
      
    payment_output:
      - eu: SEPA (pain.001)
      - us: ACH (NACHA format)
      - uk: BACS
      - brazil: PIX / Boleto
      
    statutory_output:
      - portugal: SAF-T (XML)
      - spain: SII (real-time reporting)
      - eu: DAC7, ViDA (upcoming)
```

---

## 10. Intelligence Layer

### 10.1 AI Capabilities

```yaml
intelligence:
  understanding:
    - document_understanding: unstructured → structured events
    - contextual_classification: auto-categorize transactions
    - natural_language_intents: NL → typed intent
    - natural_language_rule_authoring: NL → formal rules
    
  prediction:
    - cash_flow_forecasting: based on full event history + patterns
    - demand_sensing: internal history + external signals
    - anomaly_detection: context-aware, not just statistical
    - predictive_alerts: "budget breach likely by March"
    
  optimization:
    - working_capital: holistic AP + AR + inventory optimization
    - process_mining: identify bottlenecks from event patterns
    - configuration_suggestions: learn from human overrides
    
  explanation:
    - rule_trace: "why did this happen?" → full rule evaluation chain
    - variance_analysis: "why is margin down?" → contributing factor decomposition
    - decision_replay: "what did the agent consider?" → full reasoning trace
```

---

## 11. Interface

### 11.1 Conversational Mode (Primary)

Natural language interaction with the system. Users state goals, system resolves to intents.

### 11.2 Workspace Mode (Task-Oriented)

Component-based task queues and resolution workspaces. Organized around work items, not forms.

### 11.3 Analytical Mode (Exploration)

Conversational AI + interactive visualization for data exploration and analysis.

### 11.4 Mobile & Embedded

- Mobile: optimized for approvals, quick lookups, alerts, receipt capture
- Tablet: warehouse operations, task processing
- Embedded: email (approve from inbox), messaging (Slack/Teams), spreadsheets (live data)

### 11.5 Personalization

Three levels:
- **Workspace**: component layout, pinned entities, quick actions, notification preferences
- **Behavioral**: processing preferences, confirmation levels, learned patterns
- **Intelligence**: AI tone, suggestion focus, anomaly sensitivity

```yaml
personalization:
  portable: yes (export/import workspace configs)
  shareable: yes (power users create templates for teams)
  role_defaults: yes (sensible starting config per role)
  adaptive: yes (system learns from usage patterns)
```

---

## 12. Reporting & Analytics

```yaml
reporting:
  architecture: projections + presentation layer
  
  no_separate_reporting_system:
    - projections ARE the data
    - report definitions ARE the presentation
    - ad-hoc queries go through conversational AI + projection engine
    
  capabilities:
    - pre-defined_reports: projection + layout configuration (YAML)
    - ad_hoc: natural language → projection query → visualization
    - drill_down: any value → source events → full lineage
    - scheduling: periodic delivery via email/portal
    - security: automatic per scope (no separate report security)
    
  financial_reporting:
    - row_definitions: account_hierarchy configurations
    - column_definitions: period selections, comparison types
    - multiple_views: from same events (GAAP, IFRS, management)
    - consolidation: real-time projection across entities
    
  always_current: no "refresh" needed, projections are maintained continuously
```

---

## 13. B2B & Cross-Enterprise

```yaml
b2b:
  mechanism: shared_event_spaces
  
  participants_publish: specified event types with redacted fields
  participants_subscribe: partner events relevant to them
  
  benefits:
    - real_time: no EDI batch processing
    - structured: no format translation (or minimal via adapters)
    - traceable: events in shared space are auditable
    - privacy: each org controls what they share
    
  a2a_negotiation:
    protocol: structured (rfq → offer → counter → accept)
    bounded: each agent operates within its org's boundaries
    auditable: all negotiation events preserved
    learning: agents improve from negotiation history
    
  future: enterprise mesh networks with selective event sharing
```

---

## 14. Administration & Operations

```yaml
administration:
  configuration_as_code:
    storage: git_backed
    versioned: every change is a commit
    diffable: compare environments
    promotable: dev → staging → production
    
  environment_management:
    operations: [clone, provision, promote, tear_down]
    data: anonymization for non-production environments
    
  system_health:
    metrics: [event_throughput, projection_lag, intent_resolution_time, 
              agent_status, storage, error_rates]
    alerts: automatic based on anomaly detection
    
  change_management:
    impact_analysis: before deploying config changes
    approval: required for production changes
    rollback: automatic on failure
    
  background_processes:
    model: agents with full observability (not opaque batch jobs)
    transparent: status, progress, results all visible
```

---

## 15. Performance & Scalability

```yaml
scalability:
  architecture: CQRS (writes and reads scale independently)
  
  write_path:
    event_store: append-only, partitioned by legal_entity
    throughput: horizontal scaling via partition distribution
    
  read_path:
    projections: pre-computed, cached, independently scalable
    no_impact: on write path from heavy queries
    
  computation:
    projection_workers: stateless, horizontally scalable
    intent_resolution: stateless, horizontally scalable
    rules_evaluation: parallelizable per event
    
  continuous_planning:
    proportional: computation scales with change size, not total data size
    incremental: only affected items recomputed
    
  partitioning:
    primary: legal_entity
    secondary: site/warehouse (for inventory), division (for financial)
    
  projection_refresh_tuning:
    hot_path: real_time (trial_balance, inventory_position)
    warm_path: near_real_time (aging, analytics)
    cold_path: scheduled (historical trends, batch analytics)
```

---

## 16. Extended Capabilities — CRM & Customer

Beyond traditional ERP, the platform supports CRM, customer service, field service, and contact center as capability modules on the same engine — eliminating integration between siloed systems. The key insight: a customer is the same entity whether sales is pursuing them, service is supporting them, or finance is billing them. An order flows through sales, fulfillment, delivery, service, and finance as one continuous event chain, not five separate systems.

### 16.1 CRM

```yaml
module: customer_relationship_management

entity_schemas:
  - type: lead
    attributes: [source, status, score, assigned_to, 
                 qualification_criteria, estimated_value]
    lifecycle: [new, contacted, qualified, converted, lost]
    relationships:
      - converts_to: opportunity
      - associated_with: campaign
      - linked_to: contact
    
  - type: opportunity
    attributes: [name, stage, probability, expected_revenue, 
                 expected_close_date, products_interested]
    lifecycle: [prospecting, qualification, proposal, negotiation, 
               closed_won, closed_lost]
    relationships:
      - customer (many_to_one)
      - contacts (many_to_many)
      - products (many_to_many with quantity and pricing)
      - activities (one_to_many)
      - competitors (many_to_many)
    
  - type: quote
    attributes: [lines, pricing, validity, terms, discount_authority]
    relationships:
      - for_opportunity
      - uses_pricing_from: price_list
      - converts_to: sales_order  # seamless handoff to ERP
    
  - type: campaign
    attributes: [name, type, channel, budget, start_date, end_date, target_segment]
    relationships:
      - target_segments (many_to_many)
      - generated_leads (one_to_many)
    
  - type: activity
    description: "Unified activity model — calls, emails, meetings, tasks, notes"
    attributes: [type, subject, description, due_date, completed_date, duration, outcome]
    relationships:
      - regarding: any_entity (polymorphic: lead, opportunity, customer, case, order)
      - assigned_to: person

event_types:
  - lead_created, lead_scored, lead_qualified, lead_converted, lead_disqualified
  - opportunity_created, opportunity_stage_changed, opportunity_won, opportunity_lost
  - activity_created, activity_completed
  - quote_created, quote_sent, quote_accepted, quote_rejected
  - campaign_launched, campaign_response_received
  - customer_sentiment_detected, customer_churn_risk_flagged

intent_types:
  - create_lead
  - qualify_lead
  - create_opportunity
  - advance_opportunity
  - create_quote
  - send_quote
  - convert_to_order  # bridges CRM → ERP seamlessly

projections:
  - sales_pipeline (real_time: opportunities by stage, value, probability)
  - sales_forecast (near_real_time: weighted forecast by period, rep, territory)
  - lead_conversion_funnel (near_real_time: conversion rates by source, campaign)
  - customer_360 (real_time: unified view across ALL modules)
  - rep_performance (scheduled: activity metrics, win rates, avg deal size)
  - campaign_roi (scheduled: spend vs generated pipeline vs closed revenue)

agents:
  - lead_scoring_agent:
      subscribes_to: [lead_created, activity_completed, web_engagement_events]
      capabilities: [score_lead, suggest_qualification, route_to_rep]
      
  - sales_assistant_agent:
      subscribes_to: [opportunity_stage_changed, activity_due]
      capabilities: [suggest_next_action, draft_email, prepare_meeting_brief,
                     alert_stale_opportunity, recommend_upsell]
      
  - forecast_agent:
      subscribes_to: [opportunity_*, quote_*]
      capabilities: [compute_forecast, detect_forecast_risk, 
                     suggest_pipeline_actions]
```

### 16.2 Customer Service

```yaml
module: customer_service

entity_schemas:
  - type: case
    attributes: [title, description, priority, severity, category,
                 channel(phone|email|chat|portal|social), 
                 sla_policy, resolution]
    lifecycle: [created, assigned, in_progress, waiting_on_customer,
               waiting_on_internal, escalated, resolved, closed]
    relationships:
      - customer (many_to_one)
      - product (many_to_one, optional)
      - assigned_agent (many_to_one: human or AI)
      - related_orders (many_to_many)
      - related_cases (many_to_many)
      - knowledge_articles (many_to_many)
    
  - type: knowledge_article
    attributes: [title, content, category, keywords, helpful_count, view_count]
    lifecycle: [draft, review, published, archived]
    
  - type: sla_policy
    attributes: [name, response_time, resolution_time, escalation_rules, business_hours]
    conditions: [priority_based, customer_tier_based, product_based]
    
  - type: entitlement
    description: "What support a customer is entitled to"
    attributes: [type(warranty|contract|subscription), terms, remaining_incidents, expiry_date]
    relationships:
      - customer (many_to_one)
      - products_covered (many_to_many)

event_types:
  - case_created, case_assigned, case_escalated
  - case_status_changed, case_resolved, case_reopened, case_closed
  - customer_interaction (inbound/outbound across channels)
  - sla_warning, sla_breached
  - csat_received (customer satisfaction rating)
  - knowledge_article_suggested, knowledge_article_resolved_case

intent_types:
  - create_case
  - assign_case
  - escalate_case
  - resolve_case
  - merge_cases
  - create_return_order  # bridges to ERP
  - schedule_field_service  # bridges to field service

projections:
  - open_cases (real_time: by agent, priority, age, SLA status)
  - sla_compliance (real_time: response/resolution times vs targets)
  - csat_scores (near_real_time: by agent, category, product)
  - case_volume_trends (scheduled: volume patterns for staffing)
  - product_issue_analysis (scheduled: cases by product, defect patterns)
  - first_contact_resolution (scheduled: FCR rate by channel, category)
  - customer_health_score (near_real_time: combines service + financial + engagement data)

agents:
  - case_triage_agent:
      subscribes_to: [case_created]
      capabilities: [classify_case, assign_priority, route_to_agent,
                     suggest_knowledge_articles, detect_duplicate_case]
      trust: autonomous_with_logging
      
  - customer_support_agent:
      description: "AI agent that handles tier 1 support directly"
      subscribes_to: [case_assigned(to: self)]
      capabilities: [respond_to_customer, search_knowledge_base,
                     look_up_order_status, initiate_return,
                     escalate_to_human]
      trust: autonomous_with_logging
      boundaries:
        can_resolve: known_issue_categories
        must_escalate: [billing_disputes > $100, safety_issues,
                       legal_mentions, angry_customer_detected]
        
  - sla_monitor_agent:
      subscribes_to: [case_*, all SLA-tracked events]
      capabilities: [monitor_sla, alert_approaching_breach,
                     auto_escalate_on_breach, report_compliance]
```

### 16.3 Field Service

```yaml
module: field_service

entity_schemas:
  - type: work_order
    attributes: [type(install|repair|maintenance|inspection),
                 priority, estimated_duration, required_skills,
                 required_parts, scheduled_date, actual_date]
    lifecycle: [created, scheduled, dispatched, in_progress,
               completed, closed]
    relationships:
      - customer (many_to_one)
      - asset (many_to_one: what's being serviced)
      - assigned_technician (many_to_one)
      - related_case (many_to_one, optional)
      - parts_consumed (many_to_many with quantity)
    
  - type: asset (customer asset / installed base)
    attributes: [serial_number, model, install_date, warranty_status,
                 location, service_history, maintenance_schedule]
    relationships:
      - customer (many_to_one)
      - bom (one_to_one: component structure)
      - service_contracts (one_to_many)
      - iot_sensors (one_to_many)
    
  - type: field_technician
    extends: person
    additional_attributes: [skills, certifications, service_territory,
                           vehicle, current_location, availability]
    
  - type: service_territory
    attributes: [name, boundaries(geo_polygon), assigned_technicians]

event_types:
  - work_order_created, work_order_scheduled, work_order_dispatched
  - technician_en_route, technician_arrived, work_started
  - parts_consumed, work_completed, customer_signed_off
  - asset_installed, asset_serviced, asset_decommissioned
  - preventive_maintenance_due, warranty_expiring

intent_types:
  - create_work_order
  - schedule_work_order
  - dispatch_technician
  - complete_work_order
  - order_parts  # bridges to procurement/inventory
  - create_invoice_from_work_order  # bridges to AR

projections:
  - dispatch_board (real_time: technician locations, schedules, work orders)
  - parts_availability (real_time: required vs available by territory)
  - asset_health (near_real_time: maintenance status, predicted failures)
  - first_time_fix_rate (scheduled: by technician, issue type, asset model)
  - technician_utilization (scheduled: productive vs travel vs idle time)
  - warranty_exposure (scheduled: upcoming expirations, claim trends)

agents:
  - scheduling_optimizer:
      capabilities: [optimize_route, balance_workload, match_skills,
                     minimize_travel_time, respect_sla, handle_emergencies]
      considers: [technician_skills, location, traffic, parts_availability,
                  customer_preference, sla_deadline, work_order_priority]
                  
  - predictive_maintenance_agent:
      subscribes_to: [iot_telemetry_events, asset_service_events]
      capabilities: [predict_failure, schedule_preventive_maintenance,
                     order_parts_proactively, alert_customer]
      
  - field_service_assistant:
      description: "AI assistant for technicians in the field"
      capabilities: [provide_repair_instructions, access_asset_history,
                     diagnose_issue, order_parts, update_work_order,
                     capture_photos, generate_report]
```

### 16.4 Contact Center

```yaml
module: contact_center

entity_schemas:
  - type: conversation
    description: "A multi-channel interaction session with a customer"
    attributes: [channel, start_time, end_time, sentiment_score,
                 topics_discussed, resolution_status]
    relationships:
      - customer (many_to_one)
      - handled_by (many_to_many: may transfer between agents)
      - related_cases (many_to_many)
      - transcript (one_to_one)
    
  - type: queue
    attributes: [name, channel, skills_required, priority_rules,
                 max_wait_time, overflow_rules]
    
  - type: agent_presence
    description: "Real-time status of contact center agents (human and AI)"
    attributes: [status(available|busy|wrap_up|break|offline),
                 current_conversation, skills, capacity]

event_types:
  - conversation_started, conversation_ended
  - conversation_transferred (human→human, AI→human, human→AI)
  - customer_waiting, customer_abandoned
  - agent_status_changed
  - sentiment_shifted (real-time sentiment detection)
  - topic_detected (real-time topic classification)
  - queue_threshold_breached

intent_types:
  - route_conversation
  - transfer_conversation
  - escalate_to_supervisor
  - create_case_from_conversation
  - schedule_callback

projections:
  - real_time_queue_status (real_time: wait times, queue depths, agent availability)
  - conversation_analytics (near_real_time: avg handle time, FCR, sentiment)
  - agent_utilization (real_time: occupancy, idle time, capacity)
  - customer_journey (real_time: full interaction history across all channels)

agents:
  - routing_agent:
      description: "Intelligent conversation routing"
      capabilities: [route_by_skill, route_by_customer_value,
                     route_by_predicted_issue, balance_load]
                     
  - ai_frontline_agent:
      description: "Handles conversations directly as first responder"
      capabilities: [greet_customer, understand_intent, resolve_common_issues, 
                     collect_information, warm_transfer_to_human]
      context_access:
        - customer_360 projection (full customer history)
        - order status (from ERP)
        - case history (from customer service)
        - knowledge base
      handoff_to_human_includes:
        - conversation_summary
        - detected_intent
        - customer_sentiment
        - suggested_resolution
        - relevant_customer_history
                           
  - quality_monitor_agent:
      subscribes_to: [conversation_ended]
      capabilities: [score_conversation, detect_compliance_issues,
                     identify_coaching_opportunities, flag_at_risk_customers]
```

### 16.5 Unified Customer 360

Because all modules share the same engine, the complete customer view is a single projection — not an integration project:

```yaml
unified_customer:
  entity: customer
  type: party (extends the base party/organization model)
  
  # The customer entity accumulates attributes from all modules naturally
  attributes_from_crm:
    lead_source, segment, account_manager, lifetime_value
  attributes_from_erp:
    credit_limit, payment_terms, tax_group, currency
  attributes_from_service:
    support_tier, sla_policy, entitlements, csat_score
  attributes_from_field_service:
    installed_assets, service_territory, preferred_technician

  customer_360_projection:
    source_events: ALL events referencing customer entity
    refresh: real_time
    
    output:
      identity: golden_record from entity graph MDM
      financial: outstanding_balance, payment_history, credit_status, revenue_trend, profitability
      sales: open_opportunities, pipeline_value, recent_quotes, assigned_rep
      service: open_cases, case_history, csat_trend, sla_compliance
      field: installed_assets, upcoming_maintenance, warranty_status, service_agreements
      engagement: recent_interactions_across_all_channels, sentiment_trend, preferred_channel
      health_score: composite score predicting retention risk (from all signals)
      
    accessible_from: any module
    security: field-level masking per role
      # Sales sees sales data, service sees service data
      # Account manager sees everything
```

AI customer service agents have access to everything — they can check an invoice, schedule a field visit, and issue a credit memo in a single interaction without crossing system boundaries.

### 16.6 Cross-Module Event Flows

The modules don't "integrate" — they naturally interact through the event store:

```yaml
cross_module_flows:
  lead_to_cash:
    1. CRM: lead_created → lead_qualified → opportunity_created
    2. CRM: quote_created → quote_accepted
    3. CRM→ERP: convert_to_order intent → sales_order_created
    4. ERP: sales_order_confirmed → inventory_reserved
    5. ERP: goods_shipped → sales_invoice_generated
    6. ERP: customer_payment_received → revenue_recognized
    # One continuous event chain — no integration layer needed
    
  issue_to_resolution:
    1. Contact Center: conversation_started → issue_detected
    2. Service: case_created → case_assigned
    3. Service→Field: work_order_created (if on-site needed)
    4. Field: technician_dispatched → work_completed
    5. Field→ERP: parts_consumed → inventory_adjusted
    6. Field→ERP: create_invoice_from_work_order → invoice_generated
    7. Service: case_resolved → csat_requested
    # One event chain across "modules"
    
  predictive_service:
    1. Field: iot_sensor reports anomalous_vibration on customer asset
    2. Field: predictive_maintenance_agent detects likely failure within 30 days
    3. Field→ERP: proactive_parts_order → procurement intent
    4. Field: schedule_preventive_maintenance → work_order_created
    5. Service: proactive_customer_notification → customer impressed
    6. CRM: customer_health_score increases
    # The system prevents a problem before the customer knows about it
```

---

## 17. Physical Agents, IoT & Future-Readiness

The architecture is designed so that robots, autonomous vehicles, drones, IoT sensors, and computer vision systems integrate through the same primitives as human users and AI agents. Within 5-10 years, a typical business will have a mixed workforce of humans, AI agents, physical robots, IoT devices, and external AI agents from partners. The system treats all of these as first-class participants.

### 17.1 Physical Actor Protocol

Robots and IoT devices operate in the physical world with real-time constraints, spatial awareness, and failure modes that don't exist in software. The system provides a dedicated protocol layer:

```yaml
physical_actor_framework:
  actor_types:
    - type: autonomous_mobile_robot (AMR)
      capabilities: [navigate, pick, place, transport, scan]
      constraints:
        real_time: true          # Cannot wait for approval queues
        spatial_aware: true       # Operates in physical coordinates
        failure_modes: [battery_low, obstacle, item_not_found, 
                       mechanical_fault, network_loss]
        offline_capable: true     # Must function during connectivity gaps
      
    - type: robotic_arm
      capabilities: [pick, place, assemble, inspect, sort]
      constraints:
        real_time: true
        safety_zone: defined_workspace
        failure_modes: [calibration_drift, jam, part_mismatch]
        
    - type: autonomous_vehicle
      capabilities: [transport, deliver, return]
      constraints:
        real_time: true
        spatial_aware: true
        regulatory: vehicle_safety_standards
        
    - type: iot_sensor
      capabilities: [measure, report, alert]
      constraints:
        passive: true             # Reports data, doesn't take actions
        high_frequency: true      # May emit thousands of readings per minute
        edge_processing: true     # Filter/aggregate before sending events

  # Physical actors get a fast-path intent resolution
  real_time_pipeline:
    description: >
      Physical actors bypass approval queues. Rules still evaluate, but only 
      pre-authorized action patterns. Anything outside the pre-authorized 
      set triggers a hold (robot stops and waits).
    pre_authorized_patterns:
      - pick_from_assigned_location
      - transport_on_assigned_route
      - place_at_assigned_destination
      - report_exception
    unauthorized_patterns:
      - pick_from_unassigned_location → hold_and_escalate
      - deviate_from_route → hold_and_escalate
      
  # Spatial awareness
  spatial_model:
    warehouse_map: 3D coordinate system with zones, aisles, locations
    agent_positions: real_time tracking (all physical actors)
    collision_avoidance: coordinated through spatial reservation system
    # Robot claims a path segment → other robots route around it
    # Same claim-based coordination as software agents
    
  # Offline resilience
  offline_mode:
    behavior: >
      Physical actors cache their work queue and pre-authorized action 
      patterns locally. If connectivity drops, they continue executing 
      cached work. Events are queued locally and synced when connectivity 
      restores. Conflict resolution handles any state divergence.
    sync_protocol:
      - on_reconnect: upload queued events
      - system: validates events against current state
      - conflicts: flagged for review (e.g., item reallocated while robot offline)
```

### 17.2 Cross-Actor Orchestration

The real power is in orchestrating across actor types. A single business process may involve humans, AI agents, and robots:

```yaml
cross_actor_orchestration:
  example: order_fulfillment
  
  flow:
    1. customer_agent (AI): receives and validates order
    2. inventory_agent (AI): checks availability, reserves stock
    3. planning_agent (AI): determines optimal pick path
    4. warehouse_robot (physical): executes pick
       → robot reports: "item picked from A-03-12"
       → system validates: matches reservation
    5. warehouse_robot (physical): transports to packing
    6. packing_robot (physical): packs order
       → robot reports: "order packed, weight: 2.3kg, dims: 30x20x15"
       → system validates: weight matches expected
    7. shipping_agent (AI): selects carrier, generates label
    8. delivery_robot_or_human: handles last mile
    9. customer_agent (AI): sends confirmation, updates customer
    
  coordination:
    mechanism: same event-driven choreography as software agents
    each_step: emits events that trigger the next
    exceptions: any actor can escalate to human
    monitoring: end-to-end process projection shows status across all actors
    sla: per-step SLA with automated escalation
```

### 17.3 Human-AI-Robot Handoff Protocol

Smooth handoff between actor types is critical:

```yaml
handoff_protocol:
  robot_to_human:
    trigger: robot encounters exception it can't resolve
    action:
      - robot stops and secures current state
      - emits escalation event with full context (photo, location, item, what went wrong)
      - human receives notification with context
      - human resolves (physically or via instruction to robot)
      - robot resumes
    example: "Robot cannot locate item at expected position. 
             Photo attached. Nearest human operator notified."
    
  ai_to_human:
    trigger: agent hits confidence threshold or boundary
    action:
      - agent preserves full reasoning chain
      - presents recommendation with context to human
      - human approves, modifies, or overrides
      - agent incorporates feedback
    
  human_to_ai:
    trigger: human completes work and system should continue
    action:
      - human action emits event
      - relevant agent(s) pick up and continue processing
    example: "Human resolves invoice dispute by phone with vendor.
             Records resolution event. AP automation agent picks up
             and processes the corrected invoice automatically."
             
  robot_to_ai:
    trigger: robot completes physical task, AI continues processing
    action:
      - robot emits completion event
      - AI agent processes the outcome
    example: "Robot completes physical inventory count.
             Inventory agent compares to system records.
             Identifies discrepancies. Generates adjustment proposals."
```

### 17.4 Swarm Intelligence

When you have dozens of robots or agents, they need to coordinate as a collective:

```yaml
swarm_coordination:
  warehouse_robots:
    - shared_spatial_model: all robots see each other's positions and planned paths
    - work_distribution: central optimizer assigns work by proximity, battery, load
    - dynamic_rebalancing: if one robot fails, its work is redistributed automatically
    - learning: swarm performance metrics feed back into optimization
    
  ai_agent_swarm:
    - shared_context: agents subscribe to each other's relevant events
    - negotiation: competing objectives resolved through structured protocol
    - emergent_behavior: collection of simple agents produces complex optimization
    - example: procurement + inventory + production + finance agents collectively 
      optimize working capital without any single agent having the full picture
```

### 17.5 IoT & Sensor Networks

IoT devices are event sources — they report, not decide:

```yaml
iot_integration:
  device_registry:
    entity_schema: [device_id, type, location, calibration, accuracy]
    
  telemetry_ingestion:
    high_frequency_data: 
      store: time_series_optimized_store (NOT main event store)
      retention: days_to_months (configurable)
    promotion_rules:
      - when: measurement exceeds threshold → emit business event
      - when: pattern matches anomaly signature → emit alert event
      - when: aggregate crosses boundary → emit status event
      
  examples:
    - cold_chain: temperature sensor → cold_chain_breach_event
    - equipment: vibration sensor → predictive_maintenance_alert
    - production: flow meter → quality_control_alert
    - warehouse: shelf weight sensor → inventory_level_event
    
  event_tiers:
    business_events:
      store: primary_event_store
      retention: years
      projections: full participation
    telemetry_events:
      store: time_series_store
      retention: configurable
      projections: aggregated only
      promotion: significant readings → business events via rules
```

### 17.6 Digital Twins

IoT and telemetry data feed real-time digital twin projections:

```yaml
digital_twin:
  projections:
    - facility_model: real_time spatial view of all agents, inventory, equipment
    - equipment_health: predictive models from telemetry history
    - environmental_conditions: temperature, humidity, air quality mapping
    - production_line_status: real_time throughput, quality, utilization
    
  simulation:
    - fork the digital twin to test physical changes
    - "What if we add 3 robots to Zone B?" → simulate throughput impact
    - "What if conveyor line 2 goes down?" → simulate rerouting options
    - "What layout minimizes travel time for current order mix?"
```

### 17.7 Computer Vision

Vision systems produce structured events from visual input:

```yaml
vision_integration:
  quality_inspection: camera → quality_event (pass/fail, defect_class, confidence)
  inventory_count: drone/shelf camera → count_event (item, location, quantity)
  receiving_verification: dock camera → identification_event (items, condition)
  document_processing: scanned document → structured_event (invoice/PO data)
```

### 17.8 Actor Capability Evolution

The system accommodates capabilities shifting between actor types over time:

```yaml
capability_evolution:
  principle: >
    The intent protocol doesn't care WHO executes — it cares WHAT gets done.
    As capabilities shift from human → AI → robot, the system adapts through 
    configuration, not code changes.
    
  example_progression:
    invoice_processing:
      2025: human enters invoices, AI assists with matching
      2026: AI processes invoices autonomously, human handles exceptions
      2027: AI + document scanning robot handles physical invoices end-to-end
      
    warehouse_operations:
      2025: humans pick with system guidance, robots transport
      2026: robots pick common items, humans handle exceptions
      2027: full robotic pick-pack-ship, humans supervise
      
  configuration_change:
    # Move from human-primary to agent-primary
    - reassign: intent_type:submit_invoice
      from: human (with AI assist)
      to: agent:ap_automation (trust: autonomous_with_logging)
      human_role: exception_handler
    # No code changes. Same intent, same rules, same events. Different actor.
    
  workforce_planning_projection:
    description: >
      A projection that tracks the human/agent/robot mix over time and models 
      how shifting capabilities to different actor types would affect throughput, 
      cost, quality, and risk.
```

---

## 18. Setup & Evolution

### 18.1 Guided Onboarding — The Business Interview

Instead of filling out configuration forms, the system conducts an intelligent conversational interview:

```yaml
onboarding:
  method: conversational_guided_setup
  powered_by: same AI that drives the system's conversational interface
  
  interview_flow:
    step_1_organization:
      questions:
        - "What's your company name and primary country of operation?"
        - "Do you operate in multiple countries? Which ones?"
        - "How is your organization structured? (Divisions, departments, regions?)"
        - "How many legal entities do you have?"
      system_actions:
        - creates organizational graph
        - applies localization packs for identified countries
        - sets up legal entities with jurisdiction defaults
        - configures currency, fiscal calendar, tax registrations
        
    step_2_what_you_do:
      questions:
        - "What does your business do? (Manufacturing, distribution, services, retail?)"
        - "What are your main product/service categories?"
        - "Do you manage physical inventory?"
        - "Do you manufacture or assemble products?"
      system_actions:
        - activates relevant capability modules
        - suggests item group structures
        - configures costing methods
        - sets up production if needed
        
    step_3_how_you_buy:
      questions:
        - "How do you typically purchase goods and services?"
        - "Do you have preferred/contracted vendors?"
        - "What approval process do you use for purchases?"
        - "What are your typical payment terms?"
      system_actions:
        - configures procurement intent lifecycle
        - sets up approval rules from natural language descriptions
        - configures payment terms
        - creates vendor group structure
        
    step_4_how_you_sell:
      questions:
        - "How do customers find and buy from you?"
        - "Do you have a sales team? How is it structured?"
        - "What's your billing process?"
        - "What payment methods do your customers use?"
      system_actions:
        - activates CRM module if sales team exists
        - configures AR and billing
        - sets up customer groups and credit policies
        
    step_5_how_you_support:
      questions:
        - "Do you provide customer support?"
        - "Through which channels? (phone, email, chat, portal)"
        - "Do you have field technicians?"
        - "Do you service equipment at customer sites?"
      system_actions:
        - activates service/contact center/field service as needed
        - configures SLA policies from description
        - sets up case categories
        
    step_6_who_does_what:
      questions:
        - "What roles exist in your finance team?"
        - "Walk me through who approves what"
        - "Are there any regulatory requirements specific to your industry?"
      system_actions:
        - creates security roles from descriptions
        - configures approval rules
        - sets up segregation of duties
        - applies industry-specific regulatory rules
        
  # After each section, the AI shows generated configuration for review:
  # "Based on what you've told me, purchases under $5,000 auto-approve,
  #  $5K-$50K need manager approval, over $50K need director + CFO.
  #  Does this look right? Would you like to adjust?"
  
  output: version_controlled YAML configuration
  timeline: hours, not months
```

### 18.2 Industry Templates

Pre-built configuration packages providing 80% of setup for common business types:

```yaml
industry_templates:
  - template: discrete_manufacturing
    description: "Companies that manufacture physical products"
    activates_modules: [gl, ap, ar, procurement, inventory, production, planning, warehouse]
    pre_configured:
      - standard chart of accounts for manufacturing
      - typical cost center structure
      - standard costing with variance analysis
      - production BOM and routing framework
      - quality management integration
      - common approval workflows
    agents: [ap_automation, inventory_reorder] (suggest_only initially)
    interview_focuses_on: product structure, production process, costing preferences
      
  - template: professional_services
    description: "Consulting, legal, accounting, and similar firms"
    activates_modules: [gl, ap, ar, project_accounting, crm, time_expense]
    pre_configured:
      - chart of accounts for services (revenue recognition focus)
      - project-based dimensions
      - time and expense capture
      - utilization tracking
      - client billing configurations
      
  - template: distribution_wholesale
    activates_modules: [gl, ap, ar, procurement, inventory, warehouse, crm, field_service]
    pre_configured:
      - distribution-focused chart of accounts
      - warehouse management
      - trade agreements and pricing
      - route-based sales, delivery management
      
  - template: retail
    activates_modules: [gl, ap, ar, inventory, pos, crm, customer_service]
    
  - template: food_beverage_manufacturing
  - template: construction
  - template: healthcare
  # Extensible — partners and community can contribute templates
  # Templates are starting points, fully customizable through the interview
```

### 18.3 Process Blueprints

Specific business processes configured from interactive blueprints:

```yaml
process_blueprints:
  - blueprint: procure_to_pay
    description: "Complete purchasing through payment process"
    standard_flow:
      1. need_identified → requisition (optional)
      2. requisition_approved → purchase_order
      3. purchase_order_confirmed → sent_to_vendor
      4. goods_received → receipt_posted
      5. invoice_received → matched → approved → posted
      6. payment_proposal → approved → executed
    configuration_options:
      - requisition_required: yes/no/above_threshold
      - matching: 2_way/3_way
      - approval_routing: configurable thresholds
      - payment_method: check/ach/wire/virtual_card
      - automation_level: manual/assisted/autonomous
    setup_dialogue:
      system: "Let's set up your purchasing process. Do you require 
               purchase requisitions?"
      user: "Only for purchases over $10,000"
      system: "Got it. And for invoice matching — do you want to match 
               against both the PO and goods receipt (3-way), or just 
               the PO (2-way)?"
      user: "3-way for physical goods. 2-way for services."
      system: "Makes sense. Here's the process I've configured..."
      
  - blueprint: order_to_cash
  - blueprint: hire_to_retire
  - blueprint: plan_to_produce
  - blueprint: case_to_resolution
  - blueprint: lead_to_opportunity
```

### 18.4 Intelligent Data Import

```yaml
data_onboarding:
  method: intelligent_import
  
  capabilities:
    - accept: csv, xlsx, xml, json, database_connection, api
    
    - ai_mapping:
        description: >
          AI analyzes source data structure and automatically maps to entity 
          schemas. Human reviews and confirms.
        example:
          source_column: "Vendor Name" → vendor.legal_name (confidence: 0.95)
          source_column: "Acct #" → vendor.vendor_number (confidence: 0.82)
          source_column: "DUNS" → vendor.duns_number (confidence: 0.98)
          
    - data_quality_on_import:
        - duplicate_detection (identity resolution)
        - completeness_check (required fields)
        - format_validation (tax IDs, postal codes, etc.)
        - referential_integrity (does the referenced entity exist?)
        
    - staged_import:
        1. upload: data loaded into staging area
        2. analyze: AI maps and validates, shows issues
        3. review: human confirms mappings and resolves issues
        4. import: clean data loaded into entity graph as events
        5. verify: post-import validation projections
        
    - trial_run:
        description: >
          Import data into a sandbox and run simulated business processes 
          to verify everything works before going live.
          
  opening_balances:
    mechanism: opening_balance_events
    # Individual events per document for full drill-down even on migrated data
```

### 18.5 Safe Evolution Framework

Every change is a configuration change, and every configuration change is testable, reversible, and promotable:

```yaml
change_types:
  - type: add_capability
    example: "Company starts doing field service"
    process: activate module → setup interview → test in sandbox → promote
    risk: low (additive)
    downtime: zero
    
  - type: modify_rules
    example: "Increase PO approval threshold from $50K to $75K"
    process: modify rule → impact analysis → simulate against history → promote
    risk: low (versioned, old transactions unaffected)
    downtime: zero
    
  - type: add_legal_entity
    example: "Company expands to Germany"
    process: add entity node → apply inheritance → install localization → test IC flows → go live
    risk: low (new entity is independent partition)
    downtime: zero
    
  - type: add_dimension
    example: "Track by sustainability initiative"
    process: define dimension → set effective_date → optionally backfill → update projections
    risk: low (additive)
    downtime: zero
    
  - type: restructure_organization
    example: "Merge Division A and Division B"
    process:
      1. create new division node
      2. define mapping rules (old scope → new scope)
      3. create transition projection (shows data both ways during transition)
      4. update security scopes
      5. set cutover date
      6. events after cutover use new division
      7. historical events retain original scope BUT also projected through new structure
    risk: medium (affects scopes and reporting)
    downtime: zero (parallel projection during transition)
    
  - type: schema_extension
    example: "Track environmental impact score on purchase orders"
    process: add attribute to extension config → add validation rule → update UI → promote
    risk: low (extension, doesn't modify existing schema)
    downtime: zero
```

### 18.6 Sandbox-Test-Promote Pipeline

```yaml
change_pipeline:
  environments:
    development:
      purpose: authoring changes
      data: synthetic or anonymized snapshot
      agents: suggest_only mode
      
    staging:
      purpose: validation
      data: recent anonymized production snapshot
      config: proposed changes applied on top of production config
      validation:
        - automated tests run against business process blueprints
        - impact analysis computed (what changes vs current production)
        - regression checks (do existing processes still work?)
        - shadow_mode: new rules evaluated alongside old, differences reported
        
    production:
      config: promoted from staging after approval
      deployment: 
        - configuration changes: instant (rules have effective_dates)
        - schema changes: online (no table locks in graph model)
        - module activation: instant (additive)
        - projection rebuilds: background (old projection serves until new ready)
        
  zero_downtime_guarantee:
    mechanism:
      - config changes are effective_date governed (activated, not deployed)
      - schema extensions are additive (never modify existing schema)
      - rule version transitions are seamless (old version for old events, new for new)
      - in-flight intents complete under rules active when started
      
  rollback:
    mechanism:
      - set rule effective_to = now (deactivate, old version resumes)
      - revert config commit (git-backed)
      - projection rebuild from events (events immutable, projections rebuildable)
    data_safety: events are never deleted or modified, only reinterpreted
```

### 18.7 Configuration Health Monitoring

```yaml
configuration_health:
  agent: config_health_monitor (always active)
  
  continuous_checks:
    completeness:
      - "All active legal entities have chart of accounts configured"
      - "All intent types have at least one approval rule"
      - "All roles have scope assignments"
      
    consistency:
      - "No orphaned dimension values"
      - "No circular approval chains"
      - "No security scope gaps (data accessible to no one)"
      
    drift_detection:
      - "Staging config matches production (except intentional differences)"
      - "No manual changes outside the pipeline"
      
    optimization_suggestions:
      - "Rule X has never fired in 6 months — is it needed?"
      - "Approval threshold Y is exceeded by 95% of transactions — 
         consider raising it"
      - "Dimension Z populated on only 3% of events — should it be optional?"
      - "Users override the 3-way match rule for maintenance invoices under $500 
         about 80% of the time. Suggest adding an exception rule."
```

---

## 19. Technology Stack

```yaml
technology_stack:
  language: TypeScript (full-stack type safety)
  runtime: Node.js
  
  web_framework: Next.js (API routes + SSR + React frontend)
  
  database:
    primary: PostgreSQL
    usage:
      event_store: append-only tables, partitioned by legal_entity + time
      entity_graph: entities + relationships tables with JSONB attributes
      projections: dedicated tables per projection, optimized indexes
      
  orm: Drizzle or Prisma (type-safe database access)
  
  search: PostgreSQL full-text search (upgrade to Elasticsearch if needed)
  
  caching: Redis (projection cache, session, rate limiting)
  
  message_bus: 
    initial: PostgreSQL LISTEN/NOTIFY (simplicity first)
    scale_up: Redis Streams or NATS (if throughput demands)
    
  ai:
    llm: Anthropic Claude API (intent parsing, NL interaction, document understanding)
    embeddings: for semantic search across events and entities
    
  authentication: 
    human: OIDC/SAML SSO + MFA
    agent: service certificates
    external: mutual TLS + API keys
    
  deployment:
    initial: single server / VPS (monolith-first)
    scale_up: container orchestration (Docker + Kubernetes)
    
  monitoring: OpenTelemetry (traces, metrics, logs)
```

---

## 20. Build Roadmap

### Phase 0: Foundation Engine (Weeks 1-6)

Build the five core engine components:

1. **Event Store** (Week 1-2)
   - Append-only event storage in PostgreSQL
   - Stream organization (entity, scope, type, correlation)
   - Event schema validation
   - Subscription system (for projections and agents)
   - Partitioning by legal entity

2. **Entity Graph** (Week 2-3)
   - Entity and relationship storage
   - Schema definition and validation
   - JSONB attribute storage with indexing
   - Graph traversal queries
   - Identity resolution (basic)

3. **Rules Engine** (Week 3-4)
   - Rule definition parsing and storage
   - Condition evaluation engine
   - Action execution framework
   - Rule versioning and effective dates
   - Evaluation tracing (for audit)

4. **Projection Engine** (Week 4-5)
   - Projection definition and registration
   - Event subscription and processing
   - Materialized view maintenance
   - Snapshot and point-in-time queries
   - Refresh strategies (real-time, near-real-time, scheduled)

5. **Intent Protocol** (Week 5-6)
   - Intent type registry
   - Resolution pipeline (receive → authenticate → authorize → validate → plan → approve → execute → confirm)
   - Integration with rules engine for authorization and routing
   - Basic approval flow

### Phase 1: Governance Foundation (Weeks 7-9)

6. **Security Model** (Week 7)
   - Identity management
   - Capability/duty/role framework
   - Scope enforcement (projection partitioning)
   - Field-level masking
   - Segregation of duties enforcement

7. **Organizational Model** (Week 8)
   - Legal entity configuration
   - Configuration inheritance
   - Financial dimension framework
   - Number sequences

8. **Agent Framework** (Week 9)
   - Agent identity and lifecycle
   - Capability and boundary enforcement
   - Trust levels
   - Agent observability

### Phase 2: First Business Capability — Finance (Weeks 10-14)

9. **General Ledger** (Week 10-11)
   - Account entity schema
   - Journal events and posting rules
   - Trial balance projection
   - Financial statement projections (P&L, BS)
   - Period management

10. **Accounts Payable** (Week 12-13)
    - Vendor entity schema
    - Invoice lifecycle events
    - Three-way matching
    - Payment processing
    - AP subledger and aging projections

11. **Accounts Receivable** (Week 13-14)
    - Customer entity schema
    - Billing and invoice events
    - Payment receipt and application
    - AR subledger and aging projections
    - Credit management

### Phase 3: Supply Chain Capabilities (Weeks 15-20)

12. **Procurement** (Week 15-16)
    - Requisition → PO lifecycle
    - Vendor evaluation
    - Purchase agreement support

13. **Inventory Management** (Week 17-18)
    - Item master schema
    - Inventory transactions (receipt, issue, transfer, adjust)
    - Costing methods (FIFO, weighted average)
    - On-hand and valuation projections

14. **Continuous Planning** (Week 19-20)
    - Reactive demand/supply graph
    - Planned order generation
    - Coverage group configuration

### Phase 4: Interface & Intelligence (Weeks 21-26)

15. **Conversational Interface** (Week 21-22)
    - NL → intent parsing via Claude API
    - Context-aware conversation management
    - Entity and projection query via NL

16. **Workspace Interface** (Week 23-24)
    - Task queue component
    - Resolution workspace components
    - Approval interface
    - Dashboard components

17. **Intelligence Layer** (Week 25-26)
    - Document understanding (invoice OCR → events)
    - Anomaly detection
    - Cash flow forecasting
    - NL reporting / ad-hoc queries

### Phase 5: Extended Capabilities (Weeks 27-34)

18. **CRM** (Week 27-28)
    - Lead, opportunity, quote, campaign entity schemas
    - Sales pipeline and forecast projections
    - Activity logging
    - Quote-to-sales-order conversion (links to AR)

19. **Customer Service** (Week 29-30)
    - Case lifecycle and SLA management
    - Knowledge base
    - Queue routing
    - Customer satisfaction tracking

20. **Contact Center** (Week 31-32)
    - Multi-channel interaction handling
    - Queue management
    - AI suggestion framework
    - Self-service flows

21. **Field Service** (Week 33-34)
    - Work order lifecycle
    - Asset management and tracking
    - Dispatch board and technician scheduling
    - Service agreement management

### Phase 6: Advanced Capabilities (Weeks 35+)

22. **Warehouse Management** (advanced WMS features)
23. **Production Control** (advanced scheduling, finite capacity)
24. **B2B Event Mesh** (cross-enterprise event sharing)
25. **A2A Negotiation Protocol** (agent-to-agent commerce)
26. **Localization Packs** (US, UK, EU, India, Brazil, etc.)
27. **Advanced MDM** (external enrichment, complex hierarchies)
28. **Physical Agent Framework** (robot/drone/IoT integration, telemetry tier)
29. **Digital Twin Projections** (facility modeling, simulation)
30. **Simulation Engine** (what-if, scenario forking)
31. **Setup Wizard & Industry Templates** (guided setup, intelligent import)
32. **Mobile Interface** (native mobile, embedded integrations)
33. **Customer 360 Projection** (unified cross-module customer view)

### Milestone Checkpoints

| Milestone | Target | Success Criteria |
|-----------|--------|-----------------|
| **Engine MVP** | Week 6 | Can append events, create entities, evaluate rules, compute projections, resolve intents |
| **Governance MVP** | Week 9 | Security roles enforced, scopes partition data, agents can operate within boundaries |
| **Finance MVP** | Week 14 | Can process journal entries, invoices, payments with full audit trail |
| **Supply Chain MVP** | Week 20 | Can manage procurement, inventory, and basic planning |
| **Interface MVP** | Week 26 | Conversational + workspace interfaces operational |
| **Customer Operations MVP** | Week 34 | CRM, customer service, field service, contact center with unified Customer 360 |
| **Enterprise Ready** | Week 40+ | Localization packs, industry templates, guided setup, physical agent framework |

---

## Appendix A: Configuration Schema Reference

The complete YAML configuration schema for system setup. See separate document: `CONFIG_SCHEMA.md`

## Appendix B: Event Type Catalog

Complete catalog of all event types across all modules (ERP + CRM + Service). See separate document: `EVENT_CATALOG.md`

## Appendix C: Intent Type Catalog

Complete catalog of all intent types. See separate document: `INTENT_CATALOG.md`

## Appendix D: Projection Catalog

Complete catalog of all projections. See separate document: `PROJECTION_CATALOG.md`

## Appendix E: Rule Template Library

Standard business and regulatory rule templates. See separate document: `RULE_TEMPLATES.md`

## Appendix F: Industry Template Specifications

Detailed specifications for each industry template (manufacturing, services, distribution, retail, etc.). See separate document: `INDUSTRY_TEMPLATES.md`

## Appendix G: Localization Pack Specifications

Per-jurisdiction regulatory rules, document adapters, and configuration defaults. See separate document: `LOCALIZATION_PACKS.md`

## Appendix H: Physical Agent Integration Guide

Detailed specifications for robot, drone, IoT, and autonomous vehicle integration. See separate document: `PHYSICAL_AGENT_GUIDE.md`

---

*This specification is the foundation document for building Project Nova with Claude Code. It covers the complete platform — from core engine through ERP business capabilities, CRM, customer service, field service, contact center, physical agent integration, guided setup, and safe evolution. Each section provides enough architectural detail for implementation while maintaining flexibility in specific technical choices. The build roadmap is designed for iterative development — each phase produces a working, testable system that builds upon the previous phase.*
