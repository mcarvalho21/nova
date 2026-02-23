# 10 — Financial Dimensions: Deep Implementation Specification

**Component:** Organization — Financial Dimensions  
**Dependencies:** Event Store (01), Entity Graph (02), Rules Engine (03), Projection Engine (04)  
**Depended on by:** General Ledger (12), Accounts Payable (13), Accounts Receivable (14), all financial capabilities, Reporting (35)  

---

## 1. Overview

Financial dimensions provide multi-dimensional analytical tagging for all business events. Unlike traditional ERP where dimensions are attached to ledger transactions by users, in Project Nova dimensions are attributes of business events that are automatically resolved, validated, and inherited. The GL impact (which account, which dimensions) is derived from the event through posting rules — users never manually construct account + dimension combinations.

### 1.1 Design Principles

1. **Dimensions live on events, not accounts.** Business events carry their natural dimensional context. Posting rules derive the GL impact.
2. **Automatic resolution.** Dimensions are populated from organizational context, entity defaults, inheritance chains, and derivation rules — not manual entry.
3. **Open and extensible.** New dimensions can be added without schema changes or recompilation. Tenants can add custom dimensions.
4. **Hierarchical.** Every dimension can have a hierarchy enabling automatic rollup at any level.
5. **Validated, not gated.** Flexible validation rules replace rigid account structures. Rules are readable, testable, and explain their rejections.
6. **Multi-chart support.** The same events can produce different GL postings through different posting rule sets, enabling simultaneous GAAP, IFRS, management, and tax reporting.

### 1.2 Key Differences From D365

| Aspect | D365 | Project Nova |
|--------|------|-------------|
| Dimensions on | Ledger transaction lines | Business events |
| User enters | Account + dimension combination | Business data (category, project, etc.) |
| Account determination | Manual selection | Derived from posting rules |
| Valid combinations | Account structures (rigid matrix) | Validation rules (declarative, flexible) |
| Adding a dimension | Config + dimension sets + account structures | Register dimension definition |
| Dimension sets | Pre-computed for performance | Not needed (projections handle aggregation) |
| Default merging | Priority rules across forms | Configurable pipeline with full trace |
| Inheritance | Limited, per-form basis | Full chain across business process |

---

## 2. Data Model

### 2.1 Dimension Definition

```typescript
interface DimensionDefinition {
  // ──── Identity ────
  name: string;                        // Machine name: "department", "cost_center"
  display_name: string;                // Human name: "Department", "Cost Center"
  description: string;
  
  // ──── Scope ────
  scope: "system" | "tenant";          // System-wide or tenant-specific
  tenant_id?: string;                  // If tenant-scoped
  
  // ──── Data Type ────
  data_type: "reference" | "enum" | "string" | "code";
  
  // For "reference" type: dimension values come from entities in the graph
  reference_config?: {
    entity_type: string;               // e.g., "organizational_unit", "project"
    filter?: string;                   // Optional filter: "type == 'department'"
    display_field: string;             // Which entity field to show: "name"
    code_field: string;                // Which field is the dimension value: "code"
  };
  
  // For "enum" type: fixed list of values
  enum_values?: {
    code: string;
    display_name: string;
    active: boolean;
    effective_from: Date;
    effective_to?: Date;
  }[];
  
  // ──── Hierarchy ────
  hierarchy?: {
    levels: string[];                  // e.g., ["division", "department", "team"]
    // Hierarchy is derived from entity graph relationships
    // e.g., team → belongs_to → department → belongs_to → division
    relationship_type: string;         // "belongs_to" | "part_of" | "child_of"
    rollup_enabled: boolean;           // Can aggregate up the hierarchy
  };
  
  // ──── Requirements ────
  required_on: DimensionRequirement[];
  optional_on: DimensionRequirement[];
  
  // ──── Defaults ────
  default_sources: DimensionDefaultSource[];
  
  // ──── Metadata ────
  effective_from: Date;
  effective_to?: Date;                 // Null = currently active
  created_at: DateTime;
  created_by: string;
  
  // ──── Behavior ────
  allow_multiple: boolean;             // Can an event have multiple values? (rare, but useful for matrix orgs)
  allow_blank: boolean;                // Can it be explicitly blank vs required?
  inherit_in_chains: boolean;          // Flows through inheritance chains? (default: true)
  include_in_gl_posting: boolean;      // Does this dimension flow to GL? (default: true)
  security_scope_dimension: boolean;   // Is this dimension used for record-level security? (default: false)
}

interface DimensionRequirement {
  condition: string;                   // Rule expression: "event.generates_gl_impact == true"
  enforcement: "required" | "warn" | "prompt";
  effective_from?: Date;
  effective_to?: Date;
  legal_entities?: string[];           // Requirement may be entity-specific
  message?: string;                    // Custom message when not met
}

interface DimensionDefaultSource {
  priority: number;                    // Lower number = higher priority
  source_type: "actor" | "entity" | "context" | "rule" | "parent_event" | "manual";
  source_path: string;                 // How to resolve the value
  // Examples:
  //   "actor.organizational_assignment.department"
  //   "entity.vendor.default_dimensions.cost_center"
  //   "context.project.default_cost_center"
  //   "parent_event.dimensions.department"   (inheritance)
  //   "rule:derive_cost_center_from_department"
  condition?: string;                  // Only use this source when condition is true
  override_allowed: boolean;           // Can the user override this default?
}
```

### 2.2 Dimension Value (for non-reference dimensions)

```typescript
interface DimensionValue {
  id: string;
  dimension_name: string;              // Which dimension this value belongs to
  code: string;                        // The value code: "CC-4200"
  display_name: string;                // "Engineering - Firmware"
  
  // Hierarchy
  parent_code?: string;                // Parent value in hierarchy: "CC-4000" (Engineering group)
  hierarchy_path: string[];            // Full path: ["CC", "CC-4000", "CC-4200"]
  hierarchy_level: number;             // 0 = root, 1 = first level, etc.
  
  // Lifecycle
  status: "active" | "inactive" | "pending";
  effective_from: Date;
  effective_to?: Date;
  
  // Scope
  legal_entities: string[] | "all";    // Which legal entities can use this value
  tenant_id: string;
  
  // Metadata
  description?: string;
  tags?: string[];
  custom_attributes?: Record<string, unknown>;
}
```

### 2.3 Event Dimensions (as stored on events)

```typescript
// How dimensions are stored on each event
interface EventDimensions {
  [dimension_name: string]: {
    value: string;                     // The dimension value code
    display_name: string;              // Cached for readability
    hierarchy_path: string[];          // Full hierarchy path for rollup
    resolution: DimensionResolution;   // How this value was determined
  };
}

interface DimensionResolution {
  source: string;                      // Which default source provided the value
  source_priority: number;
  auto_resolved: boolean;              // True if system resolved, false if user entered
  overridden: boolean;                 // True if user overrode the auto-resolved value
  original_value?: string;             // If overridden: what the system would have set
  override_reason?: string;            // If overridden: why the user changed it
  validated_at: DateTime;
  validation_rules_applied: string[];  // Which validation rules were checked
}
```

### 2.4 Posting Rule

```typescript
interface PostingRule {
  id: string;
  name: string;
  description: string;
  module: string;                      // Which module owns this rule
  
  // Scope
  legal_entities: string[] | "all";
  tenant_id?: string;                  // For tenant-specific posting rules
  chart_of_accounts: string;           // Which chart this rule produces postings for
  
  // Versioning
  version: number;
  effective_from: Date;
  effective_to?: Date;
  
  // Trigger
  event_type: string;                  // Which event type triggers this rule
  condition?: string;                  // Additional condition within the event type
  
  // Posting definition
  postings: PostingLineDefinition[];
  
  // Validation
  balanced: boolean;                   // Must debits = credits? (default: true)
}

interface PostingLineDefinition {
  // Which line in the event this applies to (for multi-line events)
  applies_to: "header" | "each_line" | string;  // "each_line" or a filter expression
  
  debit_credit: "debit" | "credit";
  
  // Account determination
  account: AccountDetermination;
  
  // Dimension inheritance for this posting line
  dimensions: PostingDimensionSpec;
  
  // Amount
  amount: AmountDetermination;
  
  // Currency
  currency: "event_currency" | "functional_currency" | string;
}

interface AccountDetermination {
  type: "fixed" | "derived" | "lookup";
  
  // Fixed: always post to this account
  fixed_account?: string;
  
  // Derived: determine account from event data
  derivation?: {
    from: string;                      // Event field to derive from
    mapping: Record<string, string>;   // Value → account mapping
    default: string;                   // Fallback account
  };
  
  // Lookup: get account from entity relationship
  lookup?: {
    entity_type: string;
    entity_id_from: string;            // Event field containing entity ID
    account_field: string;             // Which field on the entity has the account
  };
}

interface PostingDimensionSpec {
  inherit: {
    dimensions: string[];              // Which dimensions to inherit from event
    from: string;                      // "event" | "line" | "entity.vendor" etc.
  }[];
  add?: {
    dimension: string;
    value_from: string;                // Where to get the value
  }[];
  exclude?: string[];                  // Dimensions to NOT include on this posting line
}

interface AmountDetermination {
  type: "event_amount" | "line_amount" | "calculated";
  field?: string;                      // For event_amount/line_amount: which field
  calculation?: string;                // For calculated: expression
}
```

### 2.5 Dimension Inheritance Chain

```typescript
interface DimensionInheritanceChain {
  id: string;
  name: string;                        // "procure_to_pay", "order_to_cash"
  description: string;
  
  links: InheritanceLink[];
}

interface InheritanceLink {
  source_event_type: string;           // "procurement.po.confirmed"
  target_event_type: string;           // "inventory.received"
  
  // How to find the source event for a given target event
  link_expression: string;             // "target.data.po_reference == source.data.po_number"
  
  // Which dimensions flow through this link
  dimensions_inherited: string[] | "all";
  
  // Override behavior
  merge_strategy: "source_wins" | "target_wins" | "explicit_only";
  // source_wins: if target has different value, source value is kept
  // target_wins: if target has different value, target value is kept
  // explicit_only: only dimensions explicitly set on target override; everything else inherited
  
  // Additional dimensions added at this step
  additional_dimensions?: {
    dimension: string;
    source: string;                    // Where to get the new dimension value
  }[];
}
```

### 2.6 Dimension Validation Rule

```typescript
interface DimensionValidationRule {
  id: string;
  name: string;
  description: string;
  
  // Scope
  legal_entities: string[] | "all";
  tenant_id?: string;
  
  // Versioning
  version: number;
  effective_from: Date;
  effective_to?: Date;
  
  // When to evaluate
  trigger: string;                     // Condition expression for when this rule applies
  
  // What to validate
  validation: string;                  // Validation expression (must return true to pass)
  
  // What happens on failure
  on_failure: {
    action: "reject" | "warn" | "prompt" | "override_with_approval";
    message: string;                   // Supports template variables: {dimension_name}, {value}
    suggestion?: string;               // Expression that suggests valid alternatives
    approval_required_from?: string;   // For override_with_approval: who can approve
  };
  
  // Priority (for ordering rule evaluation)
  priority: number;
  
  // Category
  category: "organizational" | "regulatory" | "budgetary" | "custom";
}
```

---

## 3. Database Schema

```sql
-- ════════════════════════════════════════════════════════════════
-- DIMENSION DEFINITIONS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE dimension_definitions (
    name                TEXT        NOT NULL,
    tenant_id           TEXT        NOT NULL,       -- 'system' for system-wide dimensions
    display_name        TEXT        NOT NULL,
    description         TEXT,
    
    -- Type
    scope               TEXT        NOT NULL DEFAULT 'system',
    data_type           TEXT        NOT NULL,       -- 'reference' | 'enum' | 'string' | 'code'
    reference_config    JSONB,                      -- For reference type
    
    -- Hierarchy
    hierarchy           JSONB,                      -- Hierarchy definition
    
    -- Requirements
    required_on         JSONB       DEFAULT '[]',
    optional_on         JSONB       DEFAULT '[]',
    
    -- Defaults
    default_sources     JSONB       DEFAULT '[]',
    
    -- Behavior
    allow_multiple      BOOLEAN     NOT NULL DEFAULT FALSE,
    allow_blank         BOOLEAN     NOT NULL DEFAULT FALSE,
    inherit_in_chains   BOOLEAN     NOT NULL DEFAULT TRUE,
    include_in_gl       BOOLEAN     NOT NULL DEFAULT TRUE,
    security_scope_dim  BOOLEAN     NOT NULL DEFAULT FALSE,
    
    -- Lifecycle
    effective_from      DATE        NOT NULL,
    effective_to        DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          TEXT        NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (tenant_id, name)
);


-- ════════════════════════════════════════════════════════════════
-- DIMENSION VALUES (for enum/code type dimensions)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE dimension_values (
    id                  TEXT        PRIMARY KEY,
    dimension_name      TEXT        NOT NULL,
    tenant_id           TEXT        NOT NULL,
    
    code                TEXT        NOT NULL,
    display_name        TEXT        NOT NULL,
    description         TEXT,
    
    -- Hierarchy
    parent_code         TEXT,
    hierarchy_path      TEXT[]      DEFAULT '{}',
    hierarchy_level     SMALLINT    DEFAULT 0,
    
    -- Lifecycle
    status              TEXT        NOT NULL DEFAULT 'active',
    effective_from      DATE        NOT NULL,
    effective_to        DATE,
    
    -- Scope
    legal_entities      TEXT[],                     -- NULL = all
    
    -- Metadata
    tags                TEXT[]      DEFAULT '{}',
    custom_attributes   JSONB       DEFAULT '{}',
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (tenant_id, dimension_name, code),
    FOREIGN KEY (tenant_id, dimension_name) REFERENCES dimension_definitions (tenant_id, name)
);

CREATE INDEX idx_dimval_dimension ON dimension_values (tenant_id, dimension_name, status);
CREATE INDEX idx_dimval_parent ON dimension_values (tenant_id, dimension_name, parent_code);
CREATE INDEX idx_dimval_hierarchy ON dimension_values USING GIN (hierarchy_path);


-- ════════════════════════════════════════════════════════════════
-- POSTING RULES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE posting_rules (
    id                  TEXT        PRIMARY KEY,
    name                TEXT        NOT NULL,
    description         TEXT,
    module              TEXT        NOT NULL,
    tenant_id           TEXT        NOT NULL,
    
    -- Scope
    legal_entities      TEXT[],                     -- NULL = all
    chart_of_accounts   TEXT        NOT NULL,       -- Which chart this produces postings for
    
    -- Versioning
    version             SMALLINT    NOT NULL DEFAULT 1,
    effective_from      DATE        NOT NULL,
    effective_to        DATE,
    supersedes          TEXT,                       -- Previous version's rule ID
    
    -- Trigger
    event_type          TEXT        NOT NULL,
    condition           TEXT,                       -- Additional condition expression
    
    -- Posting definition
    postings            JSONB       NOT NULL,       -- Array of PostingLineDefinition
    balanced            BOOLEAN     NOT NULL DEFAULT TRUE,
    
    -- Status
    status              TEXT        NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          TEXT        NOT NULL,
    
    UNIQUE (tenant_id, event_type, chart_of_accounts, version)
);

CREATE INDEX idx_posting_rules_event ON posting_rules (event_type, status) WHERE status = 'active';
CREATE INDEX idx_posting_rules_module ON posting_rules (module, status) WHERE status = 'active';


-- ════════════════════════════════════════════════════════════════
-- DIMENSION INHERITANCE CHAINS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE dimension_inheritance_chains (
    id                  TEXT        PRIMARY KEY,
    name                TEXT        NOT NULL,
    description         TEXT,
    tenant_id           TEXT        NOT NULL,
    
    links               JSONB       NOT NULL,       -- Array of InheritanceLink
    
    status              TEXT        NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════════
-- DIMENSION VALIDATION RULES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE dimension_validation_rules (
    id                  TEXT        PRIMARY KEY,
    name                TEXT        NOT NULL,
    description         TEXT,
    tenant_id           TEXT        NOT NULL,
    
    -- Scope
    legal_entities      TEXT[],                     -- NULL = all
    
    -- Versioning
    version             SMALLINT    NOT NULL DEFAULT 1,
    effective_from      DATE        NOT NULL,
    effective_to        DATE,
    
    -- Rule
    trigger_condition   TEXT        NOT NULL,       -- When to evaluate
    validation_expr     TEXT        NOT NULL,       -- Must return true
    
    -- Failure handling
    on_failure_action   TEXT        NOT NULL,       -- 'reject' | 'warn' | 'prompt' | 'override_with_approval'
    on_failure_message  TEXT        NOT NULL,
    suggestion_expr     TEXT,
    approval_role       TEXT,                       -- For override_with_approval
    
    -- Priority
    priority            SMALLINT    NOT NULL DEFAULT 100,
    category            TEXT        NOT NULL DEFAULT 'custom',
    
    -- Status
    status              TEXT        NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          TEXT        NOT NULL
);

CREATE INDEX idx_dimval_rules_active ON dimension_validation_rules (status, priority) WHERE status = 'active';


-- ════════════════════════════════════════════════════════════════
-- DIMENSION DEFAULT OVERRIDES (per entity)
-- ════════════════════════════════════════════════════════════════

-- Stores default dimension values for specific entities (vendors, customers, items, etc.)
CREATE TABLE entity_dimension_defaults (
    id                  TEXT        PRIMARY KEY,
    tenant_id           TEXT        NOT NULL,
    
    -- Which entity
    entity_type         TEXT        NOT NULL,
    entity_id           TEXT        NOT NULL,
    
    -- Scope (defaults may differ by legal entity)
    legal_entity        TEXT,                       -- NULL = applies to all entities
    
    -- Defaults
    dimension_defaults  JSONB       NOT NULL,       -- { "department": "ENG", "cost_center": "CC-4200" }
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (tenant_id, entity_type, entity_id, legal_entity)
);

CREATE INDEX idx_entity_dim_defaults ON entity_dimension_defaults (tenant_id, entity_type, entity_id);


-- ════════════════════════════════════════════════════════════════
-- GL POSTING LOG (events → GL entries via posting rules)
-- ════════════════════════════════════════════════════════════════

-- This table records the GL impact derived from each business event.
-- It's a projection maintained by the posting rule engine.
CREATE TABLE gl_postings (
    id                  TEXT        PRIMARY KEY,    -- ULID
    tenant_id           TEXT        NOT NULL,
    legal_entity        TEXT        NOT NULL,
    
    -- Source
    source_event_id     TEXT        NOT NULL,       -- The business event that caused this
    posting_rule_id     TEXT        NOT NULL,       -- Which posting rule was applied
    posting_rule_version SMALLINT   NOT NULL,
    chart_of_accounts   TEXT        NOT NULL,       -- Which chart this posting is for
    
    -- Temporal
    effective_date      DATE        NOT NULL,
    fiscal_year         SMALLINT    NOT NULL,
    fiscal_period       SMALLINT    NOT NULL,
    posted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Account
    account_code        TEXT        NOT NULL,
    account_name        TEXT        NOT NULL,
    debit_credit        TEXT        NOT NULL,       -- 'debit' | 'credit'
    
    -- Amount
    amount              DECIMAL(19,4) NOT NULL,
    currency            TEXT        NOT NULL,
    amount_reporting    DECIMAL(19,4),              -- In reporting currency
    exchange_rate       DECIMAL(19,10),
    
    -- Dimensions (denormalized for query performance)
    dimensions          JSONB       NOT NULL DEFAULT '{}',
    -- Flattened dimension values for indexed queries
    dim_department      TEXT,
    dim_cost_center     TEXT,
    dim_project         TEXT,
    dim_customer        TEXT,
    dim_vendor          TEXT,
    dim_product_line    TEXT,
    
    -- Hierarchy paths (for rollup queries)
    hierarchy_paths     JSONB       DEFAULT '{}',
    -- e.g., { "department": ["ENG", "ENG-FIRMWARE"], "cost_center": ["CC", "CC-4000", "CC-4200"] }
    
    -- Trace
    dimension_resolution JSONB      DEFAULT '{}',  -- How each dimension was resolved
    
    -- Correlation
    correlation_id      TEXT        NOT NULL,
    
    -- Partition key (same as events)
    CONSTRAINT valid_debit_credit CHECK (debit_credit IN ('debit', 'credit'))
    
) PARTITION BY LIST (legal_entity);

-- Indexes for common query patterns
CREATE INDEX idx_gl_postings_account 
    ON gl_postings (legal_entity, chart_of_accounts, account_code, fiscal_year, fiscal_period);

CREATE INDEX idx_gl_postings_period 
    ON gl_postings (legal_entity, chart_of_accounts, fiscal_year, fiscal_period);

CREATE INDEX idx_gl_postings_source 
    ON gl_postings (source_event_id);

-- Dimensional indexes for common slice-and-dice queries
CREATE INDEX idx_gl_postings_dept 
    ON gl_postings (legal_entity, dim_department, fiscal_year, fiscal_period) 
    WHERE dim_department IS NOT NULL;

CREATE INDEX idx_gl_postings_cc 
    ON gl_postings (legal_entity, dim_cost_center, fiscal_year, fiscal_period) 
    WHERE dim_cost_center IS NOT NULL;

CREATE INDEX idx_gl_postings_project 
    ON gl_postings (legal_entity, dim_project, fiscal_year, fiscal_period) 
    WHERE dim_project IS NOT NULL;

CREATE INDEX idx_gl_postings_customer 
    ON gl_postings (legal_entity, dim_customer, fiscal_year, fiscal_period) 
    WHERE dim_customer IS NOT NULL;

-- GIN index for arbitrary dimension queries
CREATE INDEX idx_gl_postings_dims 
    ON gl_postings USING GIN (dimensions jsonb_path_ops);
```

---

## 4. TypeScript Implementation

### 4.1 Dimension Service

```typescript
// ════════════════════════════════════════════════════════════════
// DIMENSION SERVICE — Core dimension operations
// ════════════════════════════════════════════════════════════════

class DimensionService {
  constructor(
    private db: Pool,
    private entityGraph: EntityGraphService,
    private rulesEngine: RulesEngineService,
    private eventStore: EventStoreService,
  ) {}
  
  // ════════════════════════════════════════
  // DIMENSION DEFINITION MANAGEMENT
  // ════════════════════════════════════════
  
  /**
   * Register a new dimension definition.
   */
  async registerDimension(definition: DimensionDefinition): Promise<void> {
    await this.db.query(`
      INSERT INTO dimension_definitions (
        name, tenant_id, display_name, description, scope, data_type,
        reference_config, hierarchy, required_on, optional_on,
        default_sources, allow_multiple, allow_blank, inherit_in_chains,
        include_in_gl, security_scope_dim, effective_from, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    `, [
      definition.name, definition.scope === 'system' ? 'system' : definition.tenant_id,
      definition.display_name, definition.description, definition.scope,
      definition.data_type, JSON.stringify(definition.reference_config),
      JSON.stringify(definition.hierarchy), JSON.stringify(definition.required_on),
      JSON.stringify(definition.optional_on), JSON.stringify(definition.default_sources),
      definition.allow_multiple, definition.allow_blank, definition.inherit_in_chains,
      definition.include_in_gl_posting, definition.security_scope_dimension,
      definition.effective_from, definition.created_by,
    ]);
  }
  
  /**
   * Get all active dimension definitions for a tenant.
   */
  async getActiveDimensions(
    tenantId: string, 
    asOfDate: Date = new Date()
  ): Promise<DimensionDefinition[]> {
    const result = await this.db.query(`
      SELECT * FROM dimension_definitions
      WHERE (tenant_id = 'system' OR tenant_id = $1)
        AND effective_from <= $2
        AND (effective_to IS NULL OR effective_to >= $2)
    `, [tenantId, asOfDate]);
    
    return result.rows.map(this.rowToDimensionDef);
  }
  
  // ════════════════════════════════════════
  // DIMENSION RESOLUTION PIPELINE
  // ════════════════════════════════════════
  
  /**
   * Resolve dimensions for an event.
   * This is the core pipeline: collect → prioritize → validate → enrich.
   */
  async resolveDimensions(context: DimensionResolutionContext): Promise<ResolvedDimensions> {
    const { event, actor, entities, parentEvent, manualOverrides, tenantId, legalEntity } = context;
    
    // Step 0: Get applicable dimension definitions
    const dimensions = await this.getActiveDimensions(tenantId, event.effective_date);
    const applicableDimensions = dimensions.filter(d => 
      this.isDimensionApplicable(d, event, legalEntity)
    );
    
    const resolved: ResolvedDimensions = {
      values: {},
      validationResults: [],
      warnings: [],
    };
    
    for (const dim of applicableDimensions) {
      // Step 1: Collect candidate values from all sources
      const candidates = await this.collectCandidates(dim, context);
      
      // Step 2: Apply priority to select winning value
      const selected = this.selectByPriority(candidates, dim);
      
      // Step 3: Apply manual overrides if provided
      const finalValue = manualOverrides?.[dim.name] !== undefined
        ? {
            value: manualOverrides[dim.name],
            source: 'manual_override',
            priority: 0,
            overridden: true,
            original: selected,
          }
        : selected;
      
      if (finalValue) {
        // Step 4: Enrich with hierarchy
        const enriched = await this.enrichWithHierarchy(dim, finalValue.value);
        
        resolved.values[dim.name] = {
          value: finalValue.value,
          display_name: enriched.display_name,
          hierarchy_path: enriched.hierarchy_path,
          resolution: {
            source: finalValue.source,
            source_priority: finalValue.priority,
            auto_resolved: finalValue.source !== 'manual_override',
            overridden: finalValue.overridden || false,
            original_value: finalValue.original?.value,
            override_reason: manualOverrides?.[dim.name + '_reason'],
            validated_at: new Date(),
            validation_rules_applied: [],
          },
        };
      } else {
        // No value resolved — check if required
        const requirement = this.getRequirementLevel(dim, event, legalEntity);
        if (requirement === 'required') {
          resolved.validationResults.push({
            dimension: dim.name,
            result: 'failed',
            message: `Required dimension "${dim.display_name}" could not be resolved`,
            enforcement: 'required',
          });
        }
      }
    }
    
    // Step 5: Validate dimension combinations
    const combinationValidation = await this.validateCombinations(
      resolved.values, event, tenantId, legalEntity
    );
    resolved.validationResults.push(...combinationValidation);
    
    return resolved;
  }
  
  /**
   * Collect candidate values from all configured sources.
   */
  private async collectCandidates(
    dim: DimensionDefinition,
    context: DimensionResolutionContext
  ): Promise<DimensionCandidate[]> {
    const candidates: DimensionCandidate[] = [];
    
    for (const source of dim.default_sources) {
      // Check if this source's condition is met
      if (source.condition && !this.evaluateCondition(source.condition, context)) {
        continue;
      }
      
      const value = await this.resolveFromSource(source, context);
      if (value !== null && value !== undefined) {
        candidates.push({
          value: String(value),
          source: source.source_path,
          source_type: source.source_type,
          priority: source.priority,
          override_allowed: source.override_allowed,
        });
      }
    }
    
    return candidates;
  }
  
  /**
   * Resolve a dimension value from a specific source.
   */
  private async resolveFromSource(
    source: DimensionDefaultSource,
    context: DimensionResolutionContext
  ): Promise<string | null> {
    switch (source.source_type) {
      case 'actor':
        // e.g., "actor.organizational_assignment.department"
        return this.navigatePath(context.actor, source.source_path.replace('actor.', ''));
        
      case 'entity':
        // e.g., "entity.vendor.default_dimensions.cost_center"
        return this.resolveEntityDefault(source.source_path, context);
        
      case 'context':
        // e.g., "context.project.default_cost_center"
        return this.resolveContextDefault(source.source_path, context);
        
      case 'parent_event':
        // e.g., "parent_event.dimensions.department"
        if (!context.parentEvent) return null;
        return this.navigatePath(context.parentEvent.dimensions, 
          source.source_path.replace('parent_event.dimensions.', ''));
        
      case 'rule':
        // e.g., "rule:derive_cost_center_from_department"
        return this.resolveFromRule(source.source_path, context);
        
      case 'manual':
        return null; // Manual means no auto-resolution
        
      default:
        return null;
    }
  }
  
  /**
   * Resolve dimension default from an entity's stored defaults.
   */
  private async resolveEntityDefault(
    path: string, 
    context: DimensionResolutionContext
  ): Promise<string | null> {
    // Parse path: "entity.vendor.default_dimensions.cost_center"
    const parts = path.replace('entity.', '').split('.');
    const entityType = parts[0];  // "vendor"
    const dimName = parts[parts.length - 1];  // "cost_center"
    
    // Find the relevant entity from context
    const entityId = context.entities[entityType]?.id;
    if (!entityId) return null;
    
    // Look up stored defaults
    const result = await this.db.query(`
      SELECT dimension_defaults->$1 as value
      FROM entity_dimension_defaults
      WHERE tenant_id = $2 AND entity_type = $3 AND entity_id = $4
        AND (legal_entity IS NULL OR legal_entity = $5)
      ORDER BY legal_entity NULLS LAST
      LIMIT 1
    `, [dimName, context.tenantId, entityType, entityId, context.legalEntity]);
    
    return result.rows[0]?.value || null;
  }
  
  /**
   * Resolve dimension from a derivation rule.
   * e.g., "Given department ENG-FIRMWARE, derive cost center CC-4200"
   */
  private async resolveFromRule(
    rulePath: string,
    context: DimensionResolutionContext
  ): Promise<string | null> {
    const ruleId = rulePath.replace('rule:', '');
    
    // Delegate to rules engine for evaluation
    const result = await this.rulesEngine.evaluateSingle(ruleId, {
      event: context.event,
      resolved_dimensions: context.currentlyResolved || {},
      actor: context.actor,
      entities: context.entities,
    });
    
    return result?.derived_value || null;
  }
  
  /**
   * Select the highest-priority candidate.
   */
  private selectByPriority(
    candidates: DimensionCandidate[], 
    dim: DimensionDefinition
  ): DimensionCandidate | null {
    if (candidates.length === 0) return null;
    
    // Sort by priority (lower number = higher priority)
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0];
  }
  
  /**
   * Enrich a dimension value with hierarchy information.
   */
  private async enrichWithHierarchy(
    dim: DimensionDefinition, 
    value: string
  ): Promise<{display_name: string; hierarchy_path: string[]}> {
    if (dim.data_type === 'reference' && dim.reference_config) {
      // Get from entity graph
      const entity = await this.entityGraph.getByCode(
        dim.reference_config.entity_type, value
      );
      if (entity) {
        return {
          display_name: entity.attributes[dim.reference_config.display_field] || value,
          hierarchy_path: await this.buildHierarchyPath(dim, entity),
        };
      }
    }
    
    // Get from dimension values table
    const result = await this.db.query(`
      SELECT display_name, hierarchy_path FROM dimension_values
      WHERE dimension_name = $1 AND code = $2 AND status = 'active'
      LIMIT 1
    `, [dim.name, value]);
    
    if (result.rows[0]) {
      return {
        display_name: result.rows[0].display_name,
        hierarchy_path: result.rows[0].hierarchy_path || [value],
      };
    }
    
    return { display_name: value, hierarchy_path: [value] };
  }
  
  /**
   * Build the full hierarchy path for a dimension value.
   */
  private async buildHierarchyPath(
    dim: DimensionDefinition, 
    entity: any
  ): Promise<string[]> {
    if (!dim.hierarchy) return [entity.code || entity.id];
    
    const path: string[] = [];
    let current = entity;
    
    // Walk up the hierarchy via entity graph relationships
    while (current) {
      path.unshift(current.code || current.id);
      
      if (dim.hierarchy.relationship_type) {
        const parent = await this.entityGraph.getRelated(
          current.id, dim.hierarchy.relationship_type, 'outgoing'
        );
        current = parent?.[0] || null;
      } else {
        current = null;
      }
    }
    
    return path;
  }
  
  // ════════════════════════════════════════
  // VALIDATION
  // ════════════════════════════════════════
  
  /**
   * Validate dimension combinations against validation rules.
   */
  private async validateCombinations(
    dimensions: Record<string, any>,
    event: any,
    tenantId: string,
    legalEntity: string
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    
    // Load active validation rules
    const rules = await this.db.query(`
      SELECT * FROM dimension_validation_rules
      WHERE (tenant_id = 'system' OR tenant_id = $1)
        AND status = 'active'
        AND effective_from <= $2
        AND (effective_to IS NULL OR effective_to >= $2)
        AND (legal_entities IS NULL OR $3 = ANY(legal_entities))
      ORDER BY priority
    `, [tenantId, event.effective_date, legalEntity]);
    
    for (const rule of rules.rows) {
      // Check if this rule's trigger applies to this event
      if (!this.evaluateExpression(rule.trigger_condition, { event, dimensions })) {
        continue;
      }
      
      // Evaluate the validation
      const isValid = this.evaluateExpression(rule.validation_expr, { event, dimensions });
      
      if (!isValid) {
        const result: ValidationResult = {
          rule_id: rule.id,
          rule_name: rule.name,
          dimension: 'combination',
          result: 'failed',
          message: this.interpolateMessage(rule.on_failure_message, dimensions),
          enforcement: rule.on_failure_action,
          suggestion: rule.suggestion_expr 
            ? this.evaluateExpression(rule.suggestion_expr, { event, dimensions })
            : undefined,
        };
        results.push(result);
        
        // If any rule rejects, we can short-circuit
        if (rule.on_failure_action === 'reject') {
          break;
        }
      }
    }
    
    return results;
  }
  
  // ════════════════════════════════════════
  // DIMENSION INHERITANCE
  // ════════════════════════════════════════
  
  /**
   * Inherit dimensions from a parent event through an inheritance chain.
   */
  async inheritFromParent(
    childEvent: any,
    parentEventId: string,
    legalEntity: string,
    chainId: string
  ): Promise<Record<string, any>> {
    // Load the inheritance chain
    const chain = await this.db.query(
      'SELECT links FROM dimension_inheritance_chains WHERE id = $1 AND status = $2',
      [chainId, 'active']
    );
    if (!chain.rows[0]) return {};
    
    // Find the relevant link
    const link = chain.rows[0].links.find((l: any) =>
      l.source_event_type === this.getEventTypeForInheritance(parentEventId) &&
      l.target_event_type === childEvent.type
    );
    if (!link) return {};
    
    // Load parent event's dimensions
    const parentEvent = await this.eventStore.getById(parentEventId, legalEntity);
    if (!parentEvent) return {};
    
    const inherited: Record<string, any> = {};
    const dimsToInherit = link.dimensions_inherited === 'all'
      ? Object.keys(parentEvent.dimensions)
      : link.dimensions_inherited;
    
    for (const dimName of dimsToInherit) {
      if (parentEvent.dimensions[dimName]) {
        const dim = parentEvent.dimensions[dimName];
        
        // Check merge strategy
        if (childEvent.dimensions?.[dimName]) {
          switch (link.merge_strategy) {
            case 'source_wins':
              inherited[dimName] = dim; // Parent wins
              break;
            case 'target_wins':
              // Keep child's value (don't inherit)
              break;
            case 'explicit_only':
              // Only keep child's if explicitly set (not auto-inherited)
              if (!childEvent.dimensions[dimName].resolution?.auto_resolved) {
                // Child explicitly set this — keep it
              } else {
                inherited[dimName] = dim; // Parent wins over auto-resolved
              }
              break;
          }
        } else {
          inherited[dimName] = dim;
        }
      }
    }
    
    // Add any additional dimensions from this link
    if (link.additional_dimensions) {
      for (const add of link.additional_dimensions) {
        const value = this.navigatePath(childEvent, add.source);
        if (value) {
          inherited[add.dimension] = { value, source: 'inheritance_chain_addition' };
        }
      }
    }
    
    return inherited;
  }
  
  // ════════════════════════════════════════
  // ENTITY DEFAULT MANAGEMENT
  // ════════════════════════════════════════
  
  /**
   * Set default dimensions for an entity.
   */
  async setEntityDefaults(
    tenantId: string,
    entityType: string,
    entityId: string,
    legalEntity: string | null,
    defaults: Record<string, string>
  ): Promise<void> {
    await this.db.query(`
      INSERT INTO entity_dimension_defaults (id, tenant_id, entity_type, entity_id, 
                                              legal_entity, dimension_defaults)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, entity_type, entity_id, legal_entity)
      DO UPDATE SET dimension_defaults = $6, updated_at = NOW()
    `, [ulid(), tenantId, entityType, entityId, legalEntity, JSON.stringify(defaults)]);
  }
  
  /**
   * Get default dimensions for an entity.
   */
  async getEntityDefaults(
    tenantId: string,
    entityType: string,
    entityId: string,
    legalEntity?: string
  ): Promise<Record<string, string>> {
    const result = await this.db.query(`
      SELECT dimension_defaults FROM entity_dimension_defaults
      WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3
        AND (legal_entity IS NULL OR legal_entity = $4)
      ORDER BY legal_entity NULLS LAST
    `, [tenantId, entityType, entityId, legalEntity]);
    
    // Merge: entity-specific defaults override global defaults
    let merged: Record<string, string> = {};
    for (const row of result.rows.reverse()) {
      merged = { ...merged, ...row.dimension_defaults };
    }
    return merged;
  }
  
  // ════════════════════════════════════════
  // HELPER METHODS
  // ════════════════════════════════════════
  
  private isDimensionApplicable(
    dim: DimensionDefinition, event: any, legalEntity: string
  ): boolean {
    // Check if any requirement (required or optional) matches this event
    const allRequirements = [...dim.required_on, ...dim.optional_on];
    return allRequirements.some(req => 
      this.evaluateCondition(req.condition, { event }) &&
      (!req.legal_entities || req.legal_entities.includes(legalEntity)) &&
      (!req.effective_from || event.effective_date >= req.effective_from) &&
      (!req.effective_to || event.effective_date <= req.effective_to)
    );
  }
  
  private getRequirementLevel(
    dim: DimensionDefinition, event: any, legalEntity: string
  ): "required" | "optional" | "none" {
    for (const req of dim.required_on) {
      if (this.evaluateCondition(req.condition, { event }) &&
          (!req.legal_entities || req.legal_entities.includes(legalEntity))) {
        return req.enforcement === 'required' ? 'required' : 'optional';
      }
    }
    return 'optional';
  }
  
  private evaluateCondition(condition: string, context: any): boolean {
    // Delegate to rules engine expression evaluator
    return this.rulesEngine.evaluateExpression(condition, context);
  }
  
  private evaluateExpression(expression: string, context: any): any {
    return this.rulesEngine.evaluateExpression(expression, context);
  }
  
  private navigatePath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private interpolateMessage(template: string, dimensions: any): string {
    return template.replace(/\{([^}]+)\}/g, (_, key) => {
      return this.navigatePath(dimensions, key)?.value || key;
    });
  }
  
  private rowToDimensionDef(row: any): DimensionDefinition {
    return {
      name: row.name,
      display_name: row.display_name,
      description: row.description,
      scope: row.scope,
      tenant_id: row.tenant_id === 'system' ? undefined : row.tenant_id,
      data_type: row.data_type,
      reference_config: row.reference_config,
      hierarchy: row.hierarchy,
      required_on: row.required_on,
      optional_on: row.optional_on,
      default_sources: row.default_sources,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      created_at: row.created_at,
      created_by: row.created_by,
      allow_multiple: row.allow_multiple,
      allow_blank: row.allow_blank,
      inherit_in_chains: row.inherit_in_chains,
      include_in_gl_posting: row.include_in_gl,
      security_scope_dimension: row.security_scope_dim,
    };
  }
}


// ──── Supporting Types ────

interface DimensionResolutionContext {
  event: any;                          // The event being processed
  actor: any;                          // The actor (user/agent) 
  entities: Record<string, any>;       // Related entities (vendor, customer, item, etc.)
  parentEvent?: any;                   // Parent event for inheritance
  manualOverrides?: Record<string, string>;  // User-provided dimension values
  currentlyResolved?: Record<string, any>;   // Dimensions already resolved (for derivation)
  tenantId: string;
  legalEntity: string;
}

interface ResolvedDimensions {
  values: Record<string, any>;         // Resolved dimension values with full metadata
  validationResults: ValidationResult[];
  warnings: string[];
}

interface DimensionCandidate {
  value: string;
  source: string;
  source_type: string;
  priority: number;
  override_allowed: boolean;
}

interface ValidationResult {
  rule_id?: string;
  rule_name?: string;
  dimension: string;
  result: "passed" | "failed";
  message: string;
  enforcement: string;
  suggestion?: any;
}
```

### 4.2 Posting Rule Engine

```typescript
// ════════════════════════════════════════════════════════════════
// POSTING RULE ENGINE — Derives GL impact from business events
// ════════════════════════════════════════════════════════════════

class PostingRuleEngine {
  constructor(
    private db: Pool,
    private dimensionService: DimensionService,
    private eventStore: EventStoreService,
  ) {
    // Subscribe to all events that might generate GL postings
    this.eventStore.subscribe({ modules: ['ap', 'ar', 'inventory', 'gl', 'production'] }, 
      this.processEvent.bind(this));
  }
  
  /**
   * Process a business event and generate GL postings.
   */
  async processEvent(event: BaseEvent): Promise<GLPosting[]> {
    // Find applicable posting rules for this event type
    const rules = await this.getApplicableRules(
      event.type, 
      event.scope.tenant_id,
      event.scope.legal_entity,
      event.effective_date
    );
    
    const allPostings: GLPosting[] = [];
    
    for (const rule of rules) {
      // Check additional condition if any
      if (rule.condition && !this.evaluateCondition(rule.condition, event)) {
        continue;
      }
      
      // Generate GL posting lines from the rule definition
      const postings = await this.generatePostings(rule, event);
      
      // Validate balanced (debits = credits)
      if (rule.balanced) {
        this.validateBalanced(postings, rule, event);
      }
      
      // Write to gl_postings table
      await this.writePostings(postings, event, rule);
      
      allPostings.push(...postings);
    }
    
    return allPostings;
  }
  
  /**
   * Generate posting lines from a rule definition and event.
   */
  private async generatePostings(
    rule: PostingRule, 
    event: BaseEvent
  ): Promise<GLPosting[]> {
    const postings: GLPosting[] = [];
    
    for (const postingDef of rule.postings) {
      // Determine which lines this applies to
      const applicableData = this.resolveAppliesTo(postingDef.applies_to, event);
      
      for (const data of applicableData) {
        // Determine account
        const account = await this.resolveAccount(postingDef.account, event, data);
        
        // Determine dimensions for this posting line
        const dimensions = this.resolvePostingDimensions(
          postingDef.dimensions, event, data
        );
        
        // Determine amount
        const amount = this.resolveAmount(postingDef.amount, event, data);
        
        // Determine fiscal period
        const fiscalPeriod = this.resolveFiscalPeriod(event.effective_date, event.scope.legal_entity);
        
        postings.push({
          id: ulid(),
          tenant_id: event.scope.tenant_id,
          legal_entity: event.scope.legal_entity,
          source_event_id: event.id,
          posting_rule_id: rule.id,
          posting_rule_version: rule.version,
          chart_of_accounts: rule.chart_of_accounts,
          effective_date: event.effective_date,
          fiscal_year: fiscalPeriod.year,
          fiscal_period: fiscalPeriod.period,
          account_code: account.code,
          account_name: account.name,
          debit_credit: postingDef.debit_credit,
          amount: Math.abs(amount),
          currency: this.resolveCurrency(postingDef.currency, event),
          dimensions: dimensions.values,
          dim_department: dimensions.values.department?.value,
          dim_cost_center: dimensions.values.cost_center?.value,
          dim_project: dimensions.values.project?.value,
          dim_customer: dimensions.values.customer?.value,
          dim_vendor: dimensions.values.vendor?.value,
          dim_product_line: dimensions.values.product_line?.value,
          hierarchy_paths: this.extractHierarchyPaths(dimensions.values),
          dimension_resolution: dimensions.resolution,
          correlation_id: event.correlation_id,
        });
      }
    }
    
    return postings;
  }
  
  /**
   * Resolve which account to post to based on account determination rules.
   */
  private async resolveAccount(
    determination: AccountDetermination,
    event: BaseEvent,
    lineData: any
  ): Promise<{code: string; name: string}> {
    switch (determination.type) {
      case 'fixed':
        return { 
          code: determination.fixed_account!, 
          name: await this.getAccountName(determination.fixed_account!) 
        };
        
      case 'derived': {
        const sourceValue = this.navigatePath(
          { event: event.data, line: lineData }, 
          determination.derivation!.from
        );
        const accountCode = determination.derivation!.mapping[sourceValue] 
          || determination.derivation!.default;
        return { 
          code: accountCode, 
          name: await this.getAccountName(accountCode) 
        };
      }
        
      case 'lookup': {
        const entityId = this.navigatePath(
          event.data, 
          determination.lookup!.entity_id_from
        );
        const entity = await this.entityGraph.getById(
          determination.lookup!.entity_type, entityId
        );
        const accountCode = entity?.attributes[determination.lookup!.account_field];
        return { 
          code: accountCode, 
          name: await this.getAccountName(accountCode) 
        };
      }
        
      default:
        throw new Error(`Unknown account determination type: ${determination.type}`);
    }
  }
  
  /**
   * Resolve dimensions for a posting line from the event's resolved dimensions.
   */
  private resolvePostingDimensions(
    spec: PostingDimensionSpec,
    event: BaseEvent,
    lineData: any
  ): { values: Record<string, any>; resolution: any } {
    const values: Record<string, any> = {};
    
    // Inherit specified dimensions from event or line
    for (const inheritSpec of spec.inherit) {
      const source = inheritSpec.from === 'event' 
        ? event.dimensions 
        : inheritSpec.from === 'line'
          ? lineData.dimensions
          : this.navigatePath({ event, line: lineData }, inheritSpec.from);
          
      for (const dimName of inheritSpec.dimensions) {
        if (source?.[dimName]) {
          values[dimName] = source[dimName];
        }
      }
    }
    
    // Add additional dimensions
    if (spec.add) {
      for (const addSpec of spec.add) {
        const value = this.navigatePath({ event, line: lineData }, addSpec.value_from);
        if (value) {
          values[addSpec.dimension] = { value, source: 'posting_rule_addition' };
        }
      }
    }
    
    // Exclude specified dimensions
    if (spec.exclude) {
      for (const excludeDim of spec.exclude) {
        delete values[excludeDim];
      }
    }
    
    return { values, resolution: { source: 'posting_rule', spec } };
  }
  
  /**
   * Validate that total debits equal total credits.
   */
  private validateBalanced(postings: GLPosting[], rule: PostingRule, event: BaseEvent): void {
    const totalDebit = postings
      .filter(p => p.debit_credit === 'debit')
      .reduce((sum, p) => sum + p.amount, 0);
    const totalCredit = postings
      .filter(p => p.debit_credit === 'credit')
      .reduce((sum, p) => sum + p.amount, 0);
    
    // Allow for small rounding differences (0.01)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new PostingImbalanceError(
        `Posting rule "${rule.name}" produced unbalanced entries for event ${event.id}: ` +
        `debit ${totalDebit} ≠ credit ${totalCredit}`,
        rule.id, event.id, totalDebit, totalCredit
      );
    }
  }
  
  private navigatePath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private extractHierarchyPaths(dimensions: Record<string, any>): Record<string, string[]> {
    const paths: Record<string, string[]> = {};
    for (const [name, dim] of Object.entries(dimensions)) {
      if (dim?.hierarchy_path) {
        paths[name] = dim.hierarchy_path;
      }
    }
    return paths;
  }
  
  // ... additional helper methods
}
```

---

## 5. REST API

```typescript
// ════════════════════════════════════════════════════════════════
// DIMENSION API ENDPOINTS
// ════════════════════════════════════════════════════════════════

// GET /api/dimensions
// List all dimension definitions
// Query params: ?tenant_id=xxx&active_only=true&as_of_date=2025-03-20

// POST /api/dimensions
// Register a new dimension definition

// GET /api/dimensions/:name
// Get a specific dimension definition

// PUT /api/dimensions/:name
// Update a dimension definition (creates new version via effective dating)

// GET /api/dimensions/:name/values
// List values for a dimension
// Query params: ?status=active&hierarchy_level=2&parent_code=ENG

// POST /api/dimensions/:name/values
// Add values to a dimension

// PUT /api/dimensions/:name/values/:code
// Update a dimension value (status, effective dates, hierarchy)

// GET /api/dimensions/:name/hierarchy
// Get the full hierarchy tree for a dimension

// ──── Dimension Resolution ────

// POST /api/dimensions/resolve
// Resolve dimensions for an event (preview — doesn't write anything)
// Body: { event, actor, entities, manual_overrides }
// Returns: { resolved_dimensions, validation_results, warnings }

// ──── Entity Defaults ────

// GET /api/entities/:type/:id/dimension-defaults
// Get default dimensions for an entity
// Query params: ?legal_entity=USMF

// PUT /api/entities/:type/:id/dimension-defaults
// Set default dimensions for an entity
// Body: { legal_entity?, defaults: { department: "ENG", cost_center: "CC-4200" } }

// ──── Posting Rules ────

// GET /api/posting-rules
// List all posting rules
// Query params: ?module=ap&event_type=ap.invoice.posted&chart=us_gaap

// POST /api/posting-rules
// Create a new posting rule

// GET /api/posting-rules/:id
// Get a specific posting rule

// POST /api/posting-rules/:id/simulate
// Simulate a posting rule against a sample event
// Body: { event }
// Returns: { postings, validation_results }

// ──── Validation Rules ────

// GET /api/dimension-validation-rules
// List all validation rules

// POST /api/dimension-validation-rules
// Create a new validation rule

// POST /api/dimension-validation-rules/:id/test
// Test a validation rule against historical events
// Body: { date_range, sample_size }
// Returns: { events_tested, violations_found, examples }

// ──── Inheritance Chains ────

// GET /api/dimension-inheritance-chains
// List all inheritance chains

// POST /api/dimension-inheritance-chains
// Create or update an inheritance chain
```

---

## 6. Configuration Examples

### 6.1 Standard Manufacturing Setup

```yaml
# Dimension configuration for a typical manufacturing company

dimensions:
  - name: department
    display_name: "Department"
    data_type: reference
    reference_config:
      entity_type: organizational_unit
      filter: "type == 'department'"
      display_field: name
      code_field: code
    hierarchy:
      levels: [division, department]
      relationship_type: belongs_to
      rollup_enabled: true
    required_on:
      - condition: "event.generates_gl_impact == true"
        enforcement: required
    default_sources:
      - priority: 1
        source_type: parent_event
        source_path: "parent_event.dimensions.department"
        override_allowed: true
      - priority: 2
        source_type: actor
        source_path: "actor.organizational_assignment.department"
        override_allowed: true
        
  - name: cost_center
    display_name: "Cost Center"
    data_type: reference
    reference_config:
      entity_type: cost_center
      display_field: name
      code_field: code
    hierarchy:
      levels: [cost_center_group, cost_center]
      relationship_type: belongs_to
      rollup_enabled: true
    required_on:
      - condition: "event.posting_type IN ['expense', 'procurement', 'production']"
        enforcement: required
    default_sources:
      - priority: 1
        source_type: parent_event
        source_path: "parent_event.dimensions.cost_center"
        override_allowed: true
      - priority: 2
        source_type: context
        source_path: "context.project.default_cost_center"
        condition: "event.dimensions.project IS NOT NULL"
        override_allowed: true
      - priority: 3
        source_type: entity
        source_path: "entity.vendor.default_dimensions.cost_center"
        override_allowed: true
      - priority: 4
        source_type: actor
        source_path: "actor.organizational_assignment.cost_center"
        override_allowed: true
        
  - name: project
    display_name: "Project"
    data_type: reference
    reference_config:
      entity_type: project
      display_field: name
      code_field: code
    hierarchy:
      levels: [program, project, work_package]
      relationship_type: belongs_to
      rollup_enabled: true
    required_on:
      - condition: "event.relates_to_project == true"
        enforcement: required
    optional_on:
      - condition: "event.generates_gl_impact == true"
        enforcement: prompt
    default_sources:
      - priority: 1
        source_type: parent_event
        source_path: "parent_event.dimensions.project"
        override_allowed: true
    
  - name: product_line
    display_name: "Product Line"
    data_type: reference
    reference_config:
      entity_type: product_line
      display_field: name
      code_field: code
    hierarchy:
      levels: [product_family, product_line]
      relationship_type: belongs_to
      rollup_enabled: true
    required_on:
      - condition: "event.module IN ['inventory', 'production'] AND event.data.item_id IS NOT NULL"
        enforcement: required
    default_sources:
      - priority: 1
        source_type: entity
        source_path: "entity.item.product_line"
        override_allowed: false  # Always derive from item
        
dimension_validation_rules:
  - id: dept_cc_alignment
    name: "Department-Cost Center Alignment"
    trigger_condition: "dimensions.department IS NOT NULL AND dimensions.cost_center IS NOT NULL"
    validation_expr: "dimensions.cost_center.hierarchy_path[0] == dimensions.department.hierarchy_path[0]"
    on_failure_action: reject
    on_failure_message: "Cost center {cost_center} is in division {cost_center.division} but department {department} is in division {department.division}"
    category: organizational
    
  - id: capital_project_asset_cat
    name: "Capital Project Requires Asset Category"
    trigger_condition: "dimensions.project IS NOT NULL AND dimensions.project.type == 'capital'"
    validation_expr: "dimensions.asset_category IS NOT NULL"
    on_failure_action: prompt
    on_failure_message: "Capital project requires an asset category for proper capitalization"
    category: regulatory

dimension_inheritance_chains:
  - id: procure_to_pay
    name: "Procure to Pay"
    links:
      - source_event_type: "procurement.requisition.approved"
        target_event_type: "procurement.po.created"
        dimensions_inherited: all
        merge_strategy: source_wins
        
      - source_event_type: "procurement.po.confirmed"
        target_event_type: "inventory.received"
        dimensions_inherited: [department, cost_center, project]
        merge_strategy: source_wins
        additional_dimensions:
          - dimension: warehouse
            source: "event.data.warehouse_id"
            
      - source_event_type: "inventory.received"
        target_event_type: "ap.invoice.matched"
        dimensions_inherited: all
        merge_strategy: source_wins
        
      - source_event_type: "ap.invoice.posted"
        target_event_type: "ap.payment.executed"
        dimensions_inherited: all
        merge_strategy: source_wins
```

---

## 7. Acceptance Criteria

The Financial Dimensions component is considered complete when:

- [ ] Dimensions can be defined with all supported data types (reference, enum, string, code)
- [ ] Dimension hierarchies work correctly with entity graph relationships
- [ ] Dimension resolution pipeline correctly collects, prioritizes, and selects values
- [ ] Default sources work for all types (actor, entity, context, parent_event, rule)
- [ ] Manual overrides work with full audit trail
- [ ] Dimension inheritance chains flow dimensions through procure-to-pay and order-to-cash
- [ ] Validation rules evaluate correctly and produce clear error messages
- [ ] Posting rules derive correct accounts from event data
- [ ] Posting rules produce balanced GL entries (debits = credits)
- [ ] GL postings table is populated automatically from business events
- [ ] Dimensional queries work (by department, by cost center, by project, by any combination)
- [ ] Hierarchy rollup works (query at division level aggregates all departments)
- [ ] Multiple chart of accounts projections work from same events
- [ ] Tenant-specific dimensions can be added without system changes
- [ ] Dimension values respect effective dating
- [ ] Entity default dimensions work per legal entity
- [ ] Performance: dimension resolution completes in < 50ms per event
- [ ] Performance: GL posting queries with dimensional filters complete in < 200ms

---

## 8. Dependencies & Integration Points

| Consumer | What It Uses |
|----------|-------------|
| **General Ledger** | GL postings table, trial balance projection with dimensional breakdown |
| **Accounts Payable** | Dimension resolution for invoices, dimension inheritance from POs |
| **Accounts Receivable** | Dimension resolution for billing, customer dimension defaults |
| **Procurement** | Dimension resolution for requisitions and POs |
| **Inventory** | Product line dimension from items, warehouse dimension |
| **Production** | Cost center and product line dimensions for production orders |
| **Reporting** | Dimensional rollups, hierarchy navigation, multi-chart projections |
| **Security** | Dimensions used as security scope (division-level data isolation) |
| **Audit** | Dimension resolution trace for every posting |

| Dependency | What It Needs |
|-----------|--------------|
| **Event Store** | Subscribes to events, writes GL posting events |
| **Entity Graph** | Reference dimension values, entity defaults, hierarchy traversal |
| **Rules Engine** | Expression evaluation for conditions and derivation rules |
| **Projection Engine** | GL postings are a projection maintained by posting rule engine |
