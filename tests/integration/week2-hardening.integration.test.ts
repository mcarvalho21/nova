import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestDatabase,
  destroyTestDatabase,
  type TestDatabase,
} from './helpers/test-database.js';
import { createTestServer } from './helpers/test-server.js';

describe('Week 2: Integration Hardening', () => {
  let db: TestDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDatabase();
    const server = createTestServer(db.pool);
    app = server.app;
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    if (db) await destroyTestDatabase(db);
  });

  // ── Item Entity CRUD ────────────────────────────────────

  describe('Item entity type', () => {
    it('should create an item via POST /intents and return 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.item.create',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { name: 'Widget A', sku: 'WGT-001' },
          idempotency_key: 'test-item-1',
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.event_id).toBeTruthy();
      expect(body.event.type).toBe('mdm.item.created');
      expect(body.event.data.name).toBe('Widget A');
      expect(body.event.data.sku).toBe('WGT-001');
    });

    it('should return item in GET /projections/item_list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/projections/item_list',
      });

      expect(response.statusCode).toBe(200);

      const items = response.json();
      expect(items.length).toBeGreaterThanOrEqual(1);

      const widget = items.find(
        (i: Record<string, unknown>) => i.name === 'Widget A',
      );
      expect(widget).toBeTruthy();
      expect(widget.sku).toBe('WGT-001');
    });

    it('should reject item with empty name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.item.create',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { name: '', sku: 'EMPTY-001' },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toContain('required');
    });

    it('should reject item with duplicate SKU', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.item.create',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { name: 'Widget B', sku: 'WGT-001' },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toContain('SKU already exists');
    });

    it('should allow item creation without SKU (no duplicate check)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.item.create',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { name: 'No SKU Item' },
          idempotency_key: 'test-item-no-sku',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.event.data.name).toBe('No SKU Item');
    });
  });

  // ── Vendor Update + OCC ─────────────────────────────────

  describe('Vendor update with OCC', () => {
    let vendorId: string;

    it('should create a vendor for update tests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.vendor.create',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { name: 'Northwind Traders' },
          idempotency_key: 'test-northwind-1',
        },
      });

      expect(response.statusCode).toBe(201);

      // Extract vendor_id from the event entities
      const body = response.json();
      const vendorEntity = body.event.entities.find(
        (e: Record<string, unknown>) => e.entity_type === 'vendor',
      );
      vendorId = vendorEntity.entity_id;
      expect(vendorId).toBeTruthy();
    });

    it('should update vendor with correct expected_entity_version', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.vendor.update',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { vendor_id: vendorId, name: 'Northwind Traders (Updated)' },
          expected_entity_version: 1,
          idempotency_key: 'test-northwind-update-1',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.event.type).toBe('mdm.vendor.updated');
      expect(body.event.data.name).toBe('Northwind Traders (Updated)');
    });

    it('should reflect update in vendor_list projection', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/projections/vendor_list',
      });

      const vendors = response.json();
      const northwind = vendors.find(
        (v: Record<string, unknown>) => v.vendor_id === vendorId,
      );
      expect(northwind).toBeTruthy();
      expect(northwind.name).toBe('Northwind Traders (Updated)');
    });

    it('should reject update with stale expected_entity_version (409)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.vendor.update',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { vendor_id: vendorId, name: 'Stale Update' },
          expected_entity_version: 1, // Entity is now at version 2
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error).toBe('Concurrency Conflict');
      expect(body.expected_version).toBe(1);
      expect(body.actual_version).toBe(2);
    });

    it('should return 404 for updating non-existent vendor', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.vendor.update',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { vendor_id: 'non-existent-id', name: 'Ghost Vendor' },
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Not Found');
    });
  });

  // ── Timestamp Semantics ─────────────────────────────────

  describe('Timestamp semantics', () => {
    it('should accept client-provided occurred_at and effective_date', async () => {
      const clientOccurredAt = '2025-06-15T10:00:00.000Z';
      const clientEffectiveDate = '2025-07-01T00:00:00.000Z';

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.vendor.create',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { name: 'Timestamp Vendor' },
          occurred_at: clientOccurredAt,
          effective_date: clientEffectiveDate,
          idempotency_key: 'test-timestamp-vendor',
        },
      });

      expect(response.statusCode).toBe(201);

      const { event_id } = response.json();

      // Verify via audit endpoint
      const auditResponse = await app.inject({
        method: 'GET',
        url: `/audit/events/${event_id}`,
      });

      const event = auditResponse.json();

      // occurred_at should be the client-provided value
      expect(new Date(event.occurred_at).toISOString()).toBe(clientOccurredAt);

      // effective_date should be the client-provided value
      expect(new Date(event.effective_date).toISOString()).toBe(clientEffectiveDate);

      // recorded_at should be server-generated (recent, not equal to occurred_at)
      const recordedAt = new Date(event.recorded_at);
      const occurredAt = new Date(event.occurred_at);
      expect(recordedAt.getTime()).not.toBe(occurredAt.getTime());

      // recorded_at should be recent (within 30 seconds of now)
      const now = Date.now();
      expect(Math.abs(now - recordedAt.getTime())).toBeLessThan(30_000);
    });

    it('should default occurred_at and effective_date to server time when not provided', async () => {
      const before = new Date();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.vendor.create',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { name: 'Default Timestamp Vendor' },
          idempotency_key: 'test-default-timestamp',
        },
      });

      const after = new Date();

      expect(response.statusCode).toBe(201);

      const { event_id } = response.json();

      const auditResponse = await app.inject({
        method: 'GET',
        url: `/audit/events/${event_id}`,
      });

      const event = auditResponse.json();

      // All three timestamps should be close to "now"
      for (const field of ['occurred_at', 'recorded_at', 'effective_date']) {
        const ts = new Date(event[field]);
        expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
        expect(ts.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
      }
    });
  });

  // ── Idempotency Hardening ───────────────────────────────

  describe('Idempotency hardening', () => {
    it('should return same event for duplicate idempotency_key on item create', async () => {
      const payload = {
        type: 'mdm.item.create',
        actor: { type: 'human', id: 'u1', name: 'Test User' },
        data: { name: 'Idempotent Item', sku: 'IDEMP-001' },
        idempotency_key: 'test-idemp-item',
      };

      const first = await app.inject({ method: 'POST', url: '/intents', payload });
      const second = await app.inject({ method: 'POST', url: '/intents', payload });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(first.json().event_id).toBe(second.json().event_id);

      // Only one item should exist
      const listResponse = await app.inject({
        method: 'GET',
        url: '/projections/item_list',
      });
      const items = listResponse.json();
      const matches = items.filter(
        (i: Record<string, unknown>) => i.name === 'Idempotent Item',
      );
      expect(matches).toHaveLength(1);
    });

    it('should return same event for duplicate idempotency_key on vendor update', async () => {
      // Create a vendor first
      const createRes = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.vendor.create',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { name: 'Idemp Update Vendor' },
          idempotency_key: 'test-idemp-vendor-create',
        },
      });
      const vendorEntity = createRes.json().event.entities.find(
        (e: Record<string, unknown>) => e.entity_type === 'vendor',
      );

      const updatePayload = {
        type: 'mdm.vendor.update',
        actor: { type: 'human', id: 'u1', name: 'Test User' },
        data: { vendor_id: vendorEntity.entity_id, name: 'Idemp Updated' },
        expected_entity_version: 1,
        idempotency_key: 'test-idemp-vendor-update',
      };

      const first = await app.inject({ method: 'POST', url: '/intents', payload: updatePayload });
      const second = await app.inject({ method: 'POST', url: '/intents', payload: updatePayload });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(first.json().event_id).toBe(second.json().event_id);
    });
  });

  // ── Error Handling with Rule Traces ─────────────────────

  describe('Error handling with rule traces', () => {
    it('should return full rule evaluation trace on rejection', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.item.create',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: { name: '' },
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.traces).toBeInstanceOf(Array);
      expect(body.traces.length).toBeGreaterThan(0);

      const firedTrace = body.traces.find(
        (t: Record<string, unknown>) => t.result === 'fired',
      );
      expect(firedTrace).toBeTruthy();
      expect(firedTrace.rule_id).toBe('item-name-required');
      expect(typeof firedTrace.evaluation_ms).toBe('number');
    });

    it('should return 400 for unknown intent type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'unknown.intent.type',
          actor: { type: 'human', id: 'u1', name: 'Test User' },
          data: {},
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toContain('No handler registered');
    });
  });
});
