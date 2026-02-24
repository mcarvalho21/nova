import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestDatabase,
  destroyTestDatabase,
  type TestDatabase,
} from './helpers/test-database.js';
import { createTestServer } from './helpers/test-server.js';

describe('Walking Skeleton Integration', () => {
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

  it('should create a vendor via POST /intents and return 201 with event_id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: {
        type: 'mdm.vendor.create',
        actor: { type: 'human', id: 'u1', name: 'Test User' },
        data: { name: 'Contoso Supply' },
        idempotency_key: 'test-contoso-1',
      },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body.intent_id).toBeTruthy();
    expect(body.event_id).toBeTruthy();
    expect(body.event.type).toBe('mdm.vendor.created');
    expect(body.event.data.name).toBe('Contoso Supply');
    expect(body.event.rules_evaluated).toBeInstanceOf(Array);
    expect(body.event.rules_evaluated.length).toBeGreaterThan(0);
  });

  it('should return vendor in GET /projections/vendor_list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/projections/vendor_list',
    });

    expect(response.statusCode).toBe(200);

    const vendors = response.json();
    expect(vendors.length).toBeGreaterThanOrEqual(1);

    const contoso = vendors.find(
      (v: Record<string, unknown>) => v.name === 'Contoso Supply',
    );
    expect(contoso).toBeTruthy();
    expect(contoso.vendor_id).toBeTruthy();
  });

  it('should return full event trace via GET /audit/events/:event_id', async () => {
    // First create a vendor to get an event_id
    const createResponse = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: {
        type: 'mdm.vendor.create',
        actor: { type: 'human', id: 'u1', name: 'Test User' },
        data: { name: 'Fabrikam Inc' },
        idempotency_key: 'test-fabrikam-1',
      },
    });

    const { event_id } = createResponse.json();

    const auditResponse = await app.inject({
      method: 'GET',
      url: `/audit/events/${event_id}`,
    });

    expect(auditResponse.statusCode).toBe(200);

    const event = auditResponse.json();
    expect(event.id).toBe(event_id);
    expect(event.type).toBe('mdm.vendor.created');
    expect(event.actor.type).toBe('human');
    expect(event.actor.id).toBe('u1');
    expect(event.correlation_id).toBeTruthy();
    expect(event.intent_id).toBeTruthy();
    expect(event.rules_evaluated).toBeInstanceOf(Array);
    expect(event.rules_evaluated.length).toBeGreaterThan(0);
    expect(event.entities).toBeInstanceOf(Array);
    expect(event.entities[0].entity_type).toBe('vendor');
    expect(event.entities[0].role).toBe('subject');
    expect(event.source.system).toBe('nova');
  });

  it('should reject vendor with empty name via POST /intents → 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: {
        type: 'mdm.vendor.create',
        actor: { type: 'human', id: 'u1', name: 'Test User' },
        data: { name: '' },
      },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error).toBe('Intent Rejected');
    expect(body.message).toContain('required');
  });

  it('should reject duplicate vendor name via POST /intents → 400', async () => {
    // Contoso Supply was already created in a previous test
    const response = await app.inject({
      method: 'POST',
      url: '/intents',
      payload: {
        type: 'mdm.vendor.create',
        actor: { type: 'human', id: 'u1', name: 'Test User' },
        data: { name: 'Contoso Supply' },
        idempotency_key: 'test-contoso-duplicate',
      },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error).toBe('Intent Rejected');
    expect(body.message).toContain('already exists');
    expect(body.traces).toBeInstanceOf(Array);
  });

  it('should handle idempotency: same key returns same event', async () => {
    const idempotencyKey = 'test-idempotent-vendor';
    const payload = {
      type: 'mdm.vendor.create',
      actor: { type: 'human', id: 'u1', name: 'Test User' },
      data: { name: 'Idempotent Vendor' },
      idempotency_key: idempotencyKey,
    };

    const first = await app.inject({
      method: 'POST',
      url: '/intents',
      payload,
    });

    const second = await app.inject({
      method: 'POST',
      url: '/intents',
      payload,
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    const firstBody = first.json();
    const secondBody = second.json();
    expect(firstBody.event_id).toBe(secondBody.event_id);

    // Verify only one vendor in the list with this name
    const listResponse = await app.inject({
      method: 'GET',
      url: '/projections/vendor_list',
    });
    const vendors = listResponse.json();
    const matches = vendors.filter(
      (v: Record<string, unknown>) => v.name === 'Idempotent Vendor',
    );
    expect(matches).toHaveLength(1);
  });
});
