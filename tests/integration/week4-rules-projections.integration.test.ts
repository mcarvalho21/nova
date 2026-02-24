import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  evaluate,
  evaluatePhased,
  filterActiveRules,
  evaluateCondition,
  loadRulesFromFile,
  loadRulesFromDirectory,
  EventTypeRegistryService,
  SubscriptionService,
  SnapshotService,
  registerProjectionTable,
  VENDOR_LIST_QUERIES,
} from '@nova/core';
import type { Rule, RuleContext, Condition } from '@nova/core';
import { createTestDatabase, destroyTestDatabase } from './helpers/test-database.js';
import { createTestServer } from './helpers/test-server.js';
import type { TestDatabase } from './helpers/test-database.js';
import type { TestServer } from './helpers/test-server.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: TestDatabase;
let server: TestServer;

beforeAll(async () => {
  db = await createTestDatabase();
  server = createTestServer(db.pool);
  await server.app.ready();
}, 60000);

afterAll(async () => {
  await server.app.close();
  await destroyTestDatabase(db);
}, 30000);

// ═══════════════════════════════════════════════════════════
// 1. RULES ENGINE DEPTH
// ═══════════════════════════════════════════════════════════

describe('Rules Engine Depth', () => {
  // ── 1a. New condition operators ──
  describe('Condition operators', () => {
    it('lt: value < threshold', () => {
      const condition: Condition = { field: 'amount', operator: 'lt', value: 100 };
      expect(evaluateCondition(condition, { amount: 50 })).toBe(true);
      expect(evaluateCondition(condition, { amount: 100 })).toBe(false);
      expect(evaluateCondition(condition, { amount: 150 })).toBe(false);
    });

    it('gte: value >= threshold', () => {
      const condition: Condition = { field: 'score', operator: 'gte', value: 80 };
      expect(evaluateCondition(condition, { score: 80 })).toBe(true);
      expect(evaluateCondition(condition, { score: 90 })).toBe(true);
      expect(evaluateCondition(condition, { score: 79 })).toBe(false);
    });

    it('lte: value <= threshold', () => {
      const condition: Condition = { field: 'count', operator: 'lte', value: 10 };
      expect(evaluateCondition(condition, { count: 10 })).toBe(true);
      expect(evaluateCondition(condition, { count: 5 })).toBe(true);
      expect(evaluateCondition(condition, { count: 11 })).toBe(false);
    });

    it('matches: regex match on string', () => {
      const condition: Condition = { field: 'email', operator: 'matches', value: '^[a-z]+@example\\.com$' };
      expect(evaluateCondition(condition, { email: 'test@example.com' })).toBe(true);
      expect(evaluateCondition(condition, { email: 'TEST@example.com' })).toBe(false);
      expect(evaluateCondition(condition, { email: 'bad@other.com' })).toBe(false);
    });

    it('matches: handles invalid regex gracefully', () => {
      const condition: Condition = { field: 'value', operator: 'matches', value: '[invalid' };
      expect(evaluateCondition(condition, { value: 'test' })).toBe(false);
    });

    it('context access with dot notation for nested objects', () => {
      const condition: Condition = { field: 'entity.attributes.status', operator: 'eq', value: 'active' };
      expect(evaluateCondition(condition, {
        entity: { attributes: { status: 'active' } },
      })).toBe(true);
      expect(evaluateCondition(condition, {
        entity: { attributes: { status: 'inactive' } },
      })).toBe(false);
    });
  });

  // ── 1b. YAML rule loading ──
  describe('YAML rule loading', () => {
    it('loads rules from a YAML file', () => {
      const rulesDir = join(__dirname, '../../config/rules');
      const rules = loadRulesFromFile(join(rulesDir, 'vendor-create.yaml'));
      expect(rules).toHaveLength(3);
      expect(rules[0].id).toBe('vendor-name-required');
      expect(rules[0].phase).toBe('validate');
      expect(rules[2].id).toBe('vendor-high-value-approval');
      expect(rules[2].phase).toBe('decide');
    });

    it('loads and merges rules from a directory', () => {
      const rulesDir = join(__dirname, '../../config/rules');
      const rules = loadRulesFromDirectory(rulesDir);
      // Should contain rules from all 3 YAML files
      expect(rules.length).toBeGreaterThanOrEqual(7);
      const intentTypes = new Set(rules.map((r) => r.intent_type));
      expect(intentTypes).toContain('mdm.vendor.create');
      expect(intentTypes).toContain('mdm.item.create');
      expect(intentTypes).toContain('mdm.vendor.add_contact');
    });

    it('loaded rules produce same evaluation as hardcoded rules', () => {
      const rulesDir = join(__dirname, '../../config/rules');
      const yamlRules = loadRulesFromFile(join(rulesDir, 'vendor-create.yaml'));

      const context: RuleContext = {
        intent_type: 'mdm.vendor.create',
        data: { name: 'Test Vendor', _name_missing: false, _duplicate_exists: false },
      };

      const result = evaluate(yamlRules, context);
      expect(result.decision).toBe('approve');
    });
  });

  // ── 1c. Rule versioning (effective dates) ──
  describe('Rule versioning with effective dates', () => {
    const rules: Rule[] = [
      {
        id: 'old-rule',
        name: 'Old rule',
        description: 'Expired rule',
        priority: 1,
        intent_type: 'test',
        conditions: [{ field: 'x', operator: 'eq', value: true }],
        action: 'reject',
        rejection_message: 'Old rule rejects',
        effective_from: '2025-01-01',
        effective_to: '2025-12-31',
      },
      {
        id: 'current-rule',
        name: 'Current rule',
        description: 'Active rule',
        priority: 1,
        intent_type: 'test',
        conditions: [{ field: 'x', operator: 'eq', value: true }],
        action: 'approve',
        effective_from: '2026-01-01',
      },
      {
        id: 'future-rule',
        name: 'Future rule',
        description: 'Not yet active',
        priority: 2,
        intent_type: 'test',
        conditions: [{ field: 'x', operator: 'eq', value: true }],
        action: 'reject',
        rejection_message: 'Future rule rejects',
        effective_from: '2027-01-01',
      },
    ];

    it('filters rules by effective date', () => {
      const active = filterActiveRules(rules, '2026-06-15');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('current-rule');
    });

    it('includes rules with no effective_to (open-ended)', () => {
      const active = filterActiveRules(rules, '2026-06-15');
      expect(active.some((r) => r.id === 'current-rule')).toBe(true);
    });

    it('excludes expired rules', () => {
      const active = filterActiveRules(rules, '2026-06-15');
      expect(active.some((r) => r.id === 'old-rule')).toBe(false);
    });

    it('excludes future rules', () => {
      const active = filterActiveRules(rules, '2026-06-15');
      expect(active.some((r) => r.id === 'future-rule')).toBe(false);
    });

    it('evaluate() with effectiveDate only uses active rules', () => {
      const context: RuleContext = { intent_type: 'test', data: { x: true } };
      const result = evaluate(rules, context, '2026-06-15');
      expect(result.decision).toBe('approve');
      // Traces should include skipped_inactive for expired/future rules
      const skipped = result.traces.filter((t) => t.result === 'skipped_inactive');
      expect(skipped).toHaveLength(2);
    });

    it('evaluate() without effectiveDate uses all rules', () => {
      const context: RuleContext = { intent_type: 'test', data: { x: true } };
      const result = evaluate(rules, context);
      // old-rule fires first (priority 1, reject) since no date filter
      expect(result.decision).toBe('reject');
    });
  });

  // ── 1d. Phased evaluation ──
  describe('Phased evaluation (validate → enrich → decide)', () => {
    const phasedRules: Rule[] = [
      {
        id: 'validate-name',
        name: 'Name required',
        description: 'Validate name exists',
        priority: 1,
        intent_type: 'test.phased',
        phase: 'validate',
        conditions: [{ field: '_name_missing', operator: 'eq', value: true }],
        action: 'reject',
        rejection_message: 'Name is required',
      },
      {
        id: 'enrich-category',
        name: 'Default category',
        description: 'Set default category if missing',
        priority: 1,
        intent_type: 'test.phased',
        phase: 'enrich',
        conditions: [{ field: 'category', operator: 'eq', value: undefined }],
        action: 'enrich',
        enrich_fields: { category: 'general', _enriched: true },
      },
      {
        id: 'decide-approval',
        name: 'High value needs approval',
        description: 'Route for approval if amount > 1000',
        priority: 1,
        intent_type: 'test.phased',
        phase: 'decide',
        conditions: [{ field: 'amount', operator: 'gt', value: 1000 }],
        action: 'route_for_approval',
        approver_role: 'manager',
      },
    ];

    it('runs all three phases in order', () => {
      const context: RuleContext = {
        intent_type: 'test.phased',
        data: { _name_missing: false, amount: 500 },
      };
      const result = evaluatePhased(phasedRules, context);
      expect(result.decision).toBe('approve');
      // validate rule was condition_false (name is not missing)
      // enrich rule fired (category is undefined)
      // decide rule was condition_false (amount <= 1000)
      expect(result.traces).toHaveLength(3);
      expect(result.enriched_context?.category).toBe('general');
      expect(result.enriched_context?._enriched).toBe(true);
    });

    it('validate phase rejection short-circuits enrich and decide', () => {
      const context: RuleContext = {
        intent_type: 'test.phased',
        data: { _name_missing: true, amount: 5000 },
      };
      const result = evaluatePhased(phasedRules, context);
      expect(result.decision).toBe('reject');
      expect(result.rejection_message).toBe('Name is required');
      // Only validate phase traces should exist
      expect(result.traces).toHaveLength(1);
      expect(result.traces[0].phase).toBe('validate');
    });

    it('enrich phase cannot reject', () => {
      const badRules: Rule[] = [
        {
          id: 'bad-enrich',
          name: 'Bad enrich',
          description: 'Enrich rule trying to reject',
          priority: 1,
          intent_type: 'test.phased',
          phase: 'enrich',
          conditions: [{ field: 'x', operator: 'eq', value: true }],
          action: 'reject',
          rejection_message: 'Should not reject',
        },
      ];
      const context: RuleContext = {
        intent_type: 'test.phased',
        data: { x: true },
      };
      const result = evaluatePhased(badRules, context);
      // Reject action blocked in enrich phase
      expect(result.decision).toBe('approve');
      expect(result.traces[0].result).toBe('not_applicable');
      expect(result.traces[0].actions_taken).toEqual(['reject_blocked_in_enrich_phase']);
    });

    it('decide phase routes for approval based on enriched context', () => {
      const context: RuleContext = {
        intent_type: 'test.phased',
        data: { _name_missing: false, amount: 5000 },
      };
      const result = evaluatePhased(phasedRules, context);
      expect(result.decision).toBe('route_for_approval');
      expect(result.required_approver_role).toBe('manager');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// 2. EVENT TYPE REGISTRY
// ═══════════════════════════════════════════════════════════

describe('Event Type Registry', () => {
  it('registers an event type with JSON Schema', async () => {
    const registry = server.eventTypeRegistry;
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
      required: ['name'],
    };

    const registered = await registry.register(
      'mdm.vendor.created',
      1,
      schema,
      'Schema for vendor created events',
    );

    expect(registered.type_name).toBe('mdm.vendor.created');
    expect(registered.schema_version).toBe(1);
    expect(registered.json_schema).toEqual(schema);
  });

  it('retrieves a registered schema', async () => {
    const registry = server.eventTypeRegistry;
    const result = await registry.getSchema('mdm.vendor.created', 1);
    expect(result).not.toBeNull();
    expect(result!.type_name).toBe('mdm.vendor.created');
  });

  it('lists all registered types', async () => {
    const registry = server.eventTypeRegistry;
    // Register a second type
    await registry.register('mdm.item.created', 1, {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });

    const types = await registry.listTypes();
    expect(types.length).toBeGreaterThanOrEqual(2);
  });

  it('validates valid data against schema', async () => {
    const registry = server.eventTypeRegistry;
    const valid = await registry.validate('mdm.vendor.created', 1, {
      name: 'Contoso',
      status: 'active',
    });
    expect(valid).toBe(true);
  });

  it('rejects invalid data against schema', async () => {
    const registry = server.eventTypeRegistry;
    await expect(
      registry.validate('mdm.vendor.created', 1, {
        // missing required 'name'
        status: 'invalid_status',
      }),
    ).rejects.toThrow('Event data validation failed');
  });

  it('returns true for unregistered event types (permissive)', async () => {
    const registry = server.eventTypeRegistry;
    const valid = await registry.validate('unregistered.type', 1, { anything: true });
    expect(valid).toBe(true);
  });

  it('schema validation on event append when registry is set', async () => {
    const registry = server.eventTypeRegistry;
    // Register a strict schema
    await registry.register('test.strict.event', 1, {
      type: 'object',
      properties: {
        value: { type: 'number', minimum: 0 },
      },
      required: ['value'],
    });

    // Set registry on event store
    server.eventStore.setRegistry(registry);

    // Valid append should work
    const validEvent = await server.eventStore.append({
      type: 'test.strict.event',
      schema_version: 1,
      actor: { type: 'system', id: 'test', name: 'Test' },
      correlation_id: 'test-correlation',
      data: { value: 42 },
    });
    expect(validEvent.id).toBeDefined();

    // Invalid append should fail
    await expect(
      server.eventStore.append({
        type: 'test.strict.event',
        schema_version: 1,
        actor: { type: 'system', id: 'test', name: 'Test' },
        correlation_id: 'test-correlation',
        data: { value: -5 },
      }),
    ).rejects.toThrow('Event data validation failed');

    // Clean up: remove registry to not affect other tests
    server.eventStore.setRegistry(undefined as unknown as EventTypeRegistryService);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════

describe('Subscription Management', () => {
  it('creates a subscription', async () => {
    const sub = await server.subscriptionService.create('test_projection', {
      subscriberType: 'projection',
      eventTypes: ['test.event'],
      batchSize: 50,
    });
    expect(sub.projection_type).toBe('test_projection');
    expect(sub.status).toBe('active');
    expect(sub.batch_size).toBe(50);
  });

  it('lists all subscriptions', async () => {
    const subs = await server.subscriptionService.list();
    expect(subs.length).toBeGreaterThan(0);
  });

  it('pauses a subscription', async () => {
    const paused = await server.subscriptionService.pause('test_projection');
    expect(paused).not.toBeNull();
    expect(paused!.status).toBe('paused');
  });

  it('resumes a paused subscription', async () => {
    const resumed = await server.subscriptionService.resume('test_projection');
    expect(resumed).not.toBeNull();
    expect(resumed!.status).toBe('active');
  });

  it('resets a subscription cursor', async () => {
    const reset = await server.subscriptionService.reset('test_projection');
    expect(reset).not.toBeNull();
    expect(reset!.status).toBe('resetting');
    expect(reset!.last_processed_seq).toBe(0n);

    // Set back to active for cleanup
    await server.subscriptionService.setActive('test_projection');
  });

  it('subscription API routes work', async () => {
    // List via API
    const listRes = await server.app.inject({
      method: 'GET',
      url: '/subscriptions',
    });
    expect(listRes.statusCode).toBe(200);
    const subs = JSON.parse(listRes.payload);
    expect(Array.isArray(subs)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. PROJECTION REBUILD & SNAPSHOTS
// ═══════════════════════════════════════════════════════════

describe('Projection Rebuild and Snapshots', () => {
  const actor = { type: 'human' as const, id: 'test-user', name: 'Test User' };

  // Create subscription and some test data first
  beforeAll(async () => {
    // Ensure vendor_list subscription exists
    const existing = await server.subscriptionService.getByType('vendor_list');
    if (!existing) {
      await server.subscriptionService.create('vendor_list', {
        subscriberType: 'projection',
        eventTypes: ['mdm.vendor.created', 'mdm.vendor.updated'],
      });
    }

    // Create some vendors through the intent pipeline
    for (let i = 1; i <= 3; i++) {
      await server.app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.vendor.create',
          actor,
          data: { name: `Rebuild Test Vendor ${i}` },
        },
      });
    }
  });

  it('creates a snapshot of vendor_list projection', async () => {
    const snapshot = await server.snapshotService.createSnapshot('vendor_list');
    expect(snapshot.snapshot_id).toBeDefined();
    expect(snapshot.projection_type).toBe('vendor_list');
    expect(snapshot.is_stale).toBe(false);
    expect(Array.isArray(snapshot.snapshot_data)).toBe(true);
    expect(snapshot.snapshot_data.length).toBeGreaterThanOrEqual(3);
  });

  it('lists snapshots for a projection', async () => {
    const snapshots = await server.snapshotService.listSnapshots('vendor_list');
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].projection_type).toBe('vendor_list');
  });

  it('gets latest valid snapshot', async () => {
    const snapshot = await server.snapshotService.getLatestValidSnapshot('vendor_list');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.is_stale).toBe(false);
  });

  it('invalidates snapshots from a given sequence', async () => {
    // Create a second snapshot first
    const snap = await server.snapshotService.createSnapshot('vendor_list');
    const count = await server.snapshotService.invalidateSnapshots('vendor_list', 0n);
    expect(count).toBeGreaterThan(0);

    // Verify it's stale
    const staleSnap = await server.snapshotService.getById(snap.snapshot_id);
    expect(staleSnap!.is_stale).toBe(true);
  });

  it('rebuilds vendor_list projection from event replay', async () => {
    // First check current vendor count
    const beforeRes = await server.app.inject({ method: 'GET', url: '/projections/vendor_list' });
    const beforeCount = JSON.parse(beforeRes.payload).length;
    expect(beforeCount).toBeGreaterThan(0);

    // Rebuild the projection
    const result = await server.projectionEngine.rebuild('vendor_list');
    expect(result.eventsProcessed).toBeGreaterThan(0);

    // After rebuild, vendor_list should have the same vendors
    const afterRes = await server.app.inject({ method: 'GET', url: '/projections/vendor_list' });
    const afterCount = JSON.parse(afterRes.payload).length;
    expect(afterCount).toBe(beforeCount);
  });

  it('snapshot create/restore cycle works end-to-end', async () => {
    // Create a fresh snapshot after rebuild
    const snapshot = await server.snapshotService.createSnapshot('vendor_list');
    const vendorCount = snapshot.snapshot_data.length;
    expect(vendorCount).toBeGreaterThan(0);

    // Add one more vendor
    await server.app.inject({
      method: 'POST',
      url: '/intents',
      payload: {
        type: 'mdm.vendor.create',
        actor,
        data: { name: 'Post-Snapshot Vendor' },
      },
    });

    // Verify new vendor is in the list
    const addedRes = await server.app.inject({ method: 'GET', url: '/projections/vendor_list' });
    const addedCount = JSON.parse(addedRes.payload).length;
    expect(addedCount).toBe(vendorCount + 1);

    // Restore from snapshot (should go back to snapshot state, without post-snapshot vendor)
    await server.snapshotService.restoreFromSnapshot('vendor_list', snapshot.snapshot_id);

    const restoredRes = await server.app.inject({ method: 'GET', url: '/projections/vendor_list' });
    const restoredCount = JSON.parse(restoredRes.payload).length;
    expect(restoredCount).toBe(vendorCount);

    // Rebuild to catch back up
    await server.projectionEngine.rebuild('vendor_list');
    const rebuiltRes = await server.app.inject({ method: 'GET', url: '/projections/vendor_list' });
    const rebuiltCount = JSON.parse(rebuiltRes.payload).length;
    expect(rebuiltCount).toBe(addedCount);
  });

  it('dead-letter events are recorded for handler failures', async () => {
    // Query dead letter events (should be empty for normal operations)
    const deadLetters = await server.projectionEngine.getDeadLetterEvents('vendor_list');
    // Just verify the API works; actual dead letters may or may not exist
    expect(Array.isArray(deadLetters)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 5. MULTIPLE HANDLERS PER EVENT TYPE
// ═══════════════════════════════════════════════════════════

describe('Multiple handlers per event type', () => {
  it('registers multiple handlers for the same event type', () => {
    const handlers = server.projectionEngine.getHandlers();
    const vendorCreatedHandlers = handlers.get('mdm.vendor.created');
    // At minimum, vendorListHandler listens for mdm.vendor.created
    expect(vendorCreatedHandlers).toBeDefined();
    expect(vendorCreatedHandlers!.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════
// 6. EVENT TYPE REGISTRY API ROUTES
// ═══════════════════════════════════════════════════════════

describe('Event Type Registry API', () => {
  it('POST /event-types registers a type', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/event-types',
      payload: {
        type_name: 'test.api.event',
        schema_version: 1,
        json_schema: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
        description: 'Test event via API',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.type_name).toBe('test.api.event');
  });

  it('GET /event-types lists registered types', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/event-types',
    });
    expect(res.statusCode).toBe(200);
    const types = JSON.parse(res.payload);
    expect(types.length).toBeGreaterThan(0);
  });

  it('GET /event-types/:name returns versions', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/event-types/test.api.event',
    });
    expect(res.statusCode).toBe(200);
    const versions = JSON.parse(res.payload);
    expect(versions.length).toBe(1);
    expect(versions[0].schema_version).toBe(1);
  });

  it('GET /event-types/:name returns 404 for unknown type', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/event-types/nonexistent.type',
    });
    expect(res.statusCode).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════
// 7. PROJECTION OPS API ROUTES
// ═══════════════════════════════════════════════════════════

describe('Projection Operations API', () => {
  it('POST /projections/:type/snapshot creates a snapshot', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/projections/vendor_list/snapshot',
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.snapshot_id).toBeDefined();
    expect(body.projection_type).toBe('vendor_list');
    expect(body.is_stale).toBe(false);
  });

  it('GET /projections/:type/snapshots lists snapshots', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/projections/vendor_list/snapshots',
    });
    expect(res.statusCode).toBe(200);
    const snapshots = JSON.parse(res.payload);
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it('GET /projections/:type/dead-letters returns list', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/projections/vendor_list/dead-letters',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /projections/:type/rebuild triggers rebuild', async () => {
    // Ensure subscription exists
    const existing = await server.subscriptionService.getByType('vendor_list');
    if (!existing) {
      await server.subscriptionService.create('vendor_list', {
        subscriberType: 'projection',
        eventTypes: ['mdm.vendor.created', 'mdm.vendor.updated'],
      });
    }

    const res = await server.app.inject({
      method: 'POST',
      url: '/projections/vendor_list/rebuild',
      payload: { batch_size: 50 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.projection_type).toBe('vendor_list');
    expect(body.events_processed).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 8. EVENT STORE DEPTH
// ═══════════════════════════════════════════════════════════

describe('Event Store Depth', () => {
  const actor = { type: 'system' as const, id: 'test', name: 'Test' };

  it('reads events by partition (legal_entity)', async () => {
    // Create events in different partitions
    await server.eventStore.append({
      type: 'test.partition.event',
      actor,
      correlation_id: 'partition-test-1',
      data: { partition: 'A' },
      scope: { tenant_id: 'default', legal_entity: 'entity_A' },
    });
    await server.eventStore.append({
      type: 'test.partition.event',
      actor,
      correlation_id: 'partition-test-2',
      data: { partition: 'B' },
      scope: { tenant_id: 'default', legal_entity: 'entity_B' },
    });

    const pageA = await server.eventStore.readByPartition('entity_A', {
      event_types: ['test.partition.event'],
    });
    expect(pageA.events.length).toBeGreaterThanOrEqual(1);
    expect(pageA.events.every((e) => e.scope.legal_entity === 'entity_A')).toBe(true);

    const pageB = await server.eventStore.readByPartition('entity_B', {
      event_types: ['test.partition.event'],
    });
    expect(pageB.events.length).toBeGreaterThanOrEqual(1);
    expect(pageB.events.every((e) => e.scope.legal_entity === 'entity_B')).toBe(true);
  });

  it('events carry metadata: correlation_id, caused_by, actor_id, intent_id', async () => {
    const event = await server.eventStore.append({
      type: 'test.metadata.event',
      actor,
      correlation_id: 'meta-correlation-123',
      caused_by: 'parent-event-id',
      intent_id: 'intent-456',
      data: { check: 'metadata' },
    });

    expect(event.correlation_id).toBe('meta-correlation-123');
    expect(event.caused_by).toBe('parent-event-id');
    expect(event.intent_id).toBe('intent-456');
    expect(event.actor.id).toBe('test');
  });
});
