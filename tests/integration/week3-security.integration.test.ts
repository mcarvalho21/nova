import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestDatabase,
  destroyTestDatabase,
  type TestDatabase,
} from './helpers/test-database.js';
import { createTestServer, type TestServer } from './helpers/test-server.js';
import { createTestToken, createExpiredToken, TEST_JWT_SECRET } from './helpers/test-auth.js';

describe('Week 3: Security & Approvals', () => {
  let db: TestDatabase;
  let app: FastifyInstance;
  let server: TestServer;

  beforeAll(async () => {
    db = await createTestDatabase();
    server = createTestServer(db.pool, TEST_JWT_SECRET);
    app = server.app;
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    if (db) await destroyTestDatabase(db);
  });

  // ── Authentication ──────────────────────────────────────

  describe('Authentication', () => {
    it('should return 401 without token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'No Auth Vendor' },
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('should return 401 with expired token', async () => {
      // Create token that expires immediately, then wait
      const token = createExpiredToken();
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Expired Token Vendor' },
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: 'Bearer not-a-valid-token' },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Invalid Token Vendor' },
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 201 with valid token', async () => {
      const token = createTestToken();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Auth Vendor' },
          idempotency_key: 'auth-vendor-1',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.event_id).toBeTruthy();
    });

    it('should extract actor from JWT (ignore body actor)', async () => {
      const token = createTestToken({
        sub: 'jwt-user-42',
        name: 'JWT User',
        actor_type: 'agent',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          actor: { type: 'human', id: 'body-user', name: 'Body User' },
          data: { name: 'JWT Actor Vendor' },
          idempotency_key: 'jwt-actor-vendor-1',
        },
      });

      expect(response.statusCode).toBe(201);

      // Verify actor came from JWT via audit
      const { event_id } = response.json();
      const audit = await app.inject({
        method: 'GET',
        url: `/audit/events/${event_id}`,
      });
      const event = audit.json();
      expect(event.actor.id).toBe('jwt-user-42');
      expect(event.actor.name).toBe('JWT User');
      expect(event.actor.type).toBe('agent');
    });
  });

  // ── Authorization ───────────────────────────────────────

  describe('Authorization', () => {
    it('should return 403 without required capability', async () => {
      const token = createTestToken({
        capabilities: ['mdm.item.create'], // Missing vendor create
      });

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Unauthorized Vendor' },
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error).toBe('Forbidden');
    });

    it('should return 201 with correct capability', async () => {
      const token = createTestToken({
        capabilities: ['mdm.vendor.create'],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Authorized Vendor' },
          idempotency_key: 'authorized-vendor-1',
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ── Scope ───────────────────────────────────────────────

  describe('Scope (Legal Entity)', () => {
    it('should create vendor in actor legal entity', async () => {
      const token = createTestToken({ legal_entity: 'acme-corp' });

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Scoped Vendor' },
          idempotency_key: 'scoped-vendor-1',
        },
      });

      expect(response.statusCode).toBe(201);

      // Verify event scope
      const { event_id } = response.json();
      const audit = await app.inject({
        method: 'GET',
        url: `/audit/events/${event_id}`,
      });
      const event = audit.json();
      expect(event.scope.legal_entity).toBe('acme-corp');
    });

    it('should reject cross-LE update', async () => {
      // Create vendor in acme-corp
      const acmeToken = createTestToken({
        legal_entity: 'acme-corp',
        capabilities: ['mdm.vendor.create', 'mdm.vendor.update'],
      });

      const createRes = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${acmeToken}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Acme Only Vendor' },
          idempotency_key: 'acme-only-vendor-1',
        },
      });
      expect(createRes.statusCode).toBe(201);

      const vendorId = createRes.json().event.entities.find(
        (e: Record<string, unknown>) => e.entity_type === 'vendor',
      ).entity_id;

      // Try to update from globex-corp
      const globexToken = createTestToken({
        sub: 'globex-user',
        legal_entity: 'globex-corp',
        capabilities: ['mdm.vendor.create', 'mdm.vendor.update'],
      });

      const updateRes = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${globexToken}` },
        payload: {
          type: 'mdm.vendor.update',
          data: { vendor_id: vendorId, name: 'Hijacked' },
          expected_entity_version: 1,
        },
      });

      // Should 404 because entity is not visible from globex-corp
      expect(updateRes.statusCode).toBe(404);
    });

    it('should include legal_entity in projection', async () => {
      const token = createTestToken({ legal_entity: 'projection-test-le' });

      const createRes = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Projection LE Vendor' },
          idempotency_key: 'projection-le-vendor-1',
        },
      });
      expect(createRes.statusCode).toBe(201);

      // Query projections (without RLS — just check LE is stored)
      const listRes = await app.inject({
        method: 'GET',
        url: '/projections/vendor_list',
        headers: { authorization: `Bearer ${token}` },
      });
      const vendors = listRes.json();
      const match = vendors.find(
        (v: Record<string, unknown>) => v.name === 'Projection LE Vendor',
      );
      expect(match).toBeTruthy();
      expect(match.legal_entity).toBe('projection-test-le');
    });
  });

  // ── Approval Workflow ───────────────────────────────────

  describe('Approval workflow', () => {
    it('should auto-approve vendor with normal credit_limit (201)', async () => {
      const token = createTestToken();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Normal Vendor', credit_limit: 50000 },
          idempotency_key: 'normal-vendor-1',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().event_id).toBeTruthy();
    });

    it('should route high-value vendor for approval (202)', async () => {
      const token = createTestToken({ sub: 'requester-1' });

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Big Vendor', credit_limit: 200000 },
        },
      });

      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(body.status).toBe('pending_approval');
      expect(body.required_approver_role).toBe('mdm_manager');
      expect(body.intent_id).toBeTruthy();
    });

    it('should approve a pending intent', async () => {
      // Create high-value vendor (pending)
      const requesterToken = createTestToken({ sub: 'requester-2', name: 'Requester' });

      const createRes = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Approvable Vendor', credit_limit: 150000 },
        },
      });
      expect(createRes.statusCode).toBe(202);
      const { intent_id } = createRes.json();

      // Approve with a different user
      const approverToken = createTestToken({ sub: 'approver-1', name: 'Approver' });

      const approveRes = await app.inject({
        method: 'POST',
        url: `/intents/${intent_id}/approve`,
        headers: { authorization: `Bearer ${approverToken}` },
        payload: { reason: 'Reviewed and approved' },
      });

      expect(approveRes.statusCode).toBe(200);
      const body = approveRes.json();
      expect(body.status).toBe('approved');
      expect(body.approved_by_id).toBe('approver-1');
    });

    it('should reject a pending intent', async () => {
      // Create high-value vendor (pending)
      const requesterToken = createTestToken({ sub: 'requester-3', name: 'Requester' });

      const createRes = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Rejectable Vendor', credit_limit: 300000 },
        },
      });
      expect(createRes.statusCode).toBe(202);
      const { intent_id } = createRes.json();

      // Reject with a different user
      const rejectorToken = createTestToken({ sub: 'rejector-1', name: 'Rejector' });

      const rejectRes = await app.inject({
        method: 'POST',
        url: `/intents/${intent_id}/reject`,
        headers: { authorization: `Bearer ${rejectorToken}` },
        payload: { reason: 'Too risky' },
      });

      expect(rejectRes.statusCode).toBe(200);
      const body = rejectRes.json();
      expect(body.status).toBe('rejected');
      expect(body.rejected_by_id).toBe('rejector-1');
    });

    it('should enforce SoD: approver cannot be actor', async () => {
      // Create high-value vendor
      const sameUserToken = createTestToken({ sub: 'same-user', name: 'Same User' });

      const createRes = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${sameUserToken}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'SoD Test Vendor', credit_limit: 500000 },
        },
      });
      expect(createRes.statusCode).toBe(202);
      const { intent_id } = createRes.json();

      // Try to approve with the same user
      const approveRes = await app.inject({
        method: 'POST',
        url: `/intents/${intent_id}/approve`,
        headers: { authorization: `Bearer ${sameUserToken}` },
        payload: { reason: 'Self-approve' },
      });

      expect(approveRes.statusCode).toBe(403);
      const body = approveRes.json();
      expect(body.message).toContain('Separation of duties');
    });

    it('should return intent status via GET /intents/:id', async () => {
      const token = createTestToken({ sub: 'requester-get' });

      const createRes = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Get Status Vendor', credit_limit: 250000 },
        },
      });
      expect(createRes.statusCode).toBe(202);
      const { intent_id } = createRes.json();

      const getRes = await app.inject({
        method: 'GET',
        url: `/intents/${intent_id}`,
      });

      expect(getRes.statusCode).toBe(200);
      const body = getRes.json();
      expect(body.id).toBe(intent_id);
      expect(body.status).toBe('pending_approval');
      expect(body.type).toBe('mdm.vendor.create');
      expect(body.required_approver_role).toBe('mdm_manager');
    });
  });

  // ── Entity Relationships ────────────────────────────────

  describe('Entity Relationships', () => {
    let contactVendorId: string;

    it('should create a vendor for contact tests', async () => {
      const token = createTestToken();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Contact Test Vendor' },
          idempotency_key: 'contact-test-vendor-1',
        },
      });

      expect(response.statusCode).toBe(201);
      contactVendorId = response.json().event.entities.find(
        (e: Record<string, unknown>) => e.entity_type === 'vendor',
      ).entity_id;
    });

    it('should add a contact to a vendor', async () => {
      const token = createTestToken();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.add_contact',
          data: {
            vendor_id: contactVendorId,
            contact_name: 'John Smith',
            email: 'john@example.com',
            phone: '+1-555-0100',
          },
          idempotency_key: 'contact-1',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.event.type).toBe('mdm.vendor.contact_added');
      expect(body.event.data.contact_name).toBe('John Smith');
      expect(body.event.data.contact_id).toBeTruthy();
    });

    it('should reject contact with empty name', async () => {
      const token = createTestToken();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.add_contact',
          data: {
            vendor_id: contactVendorId,
            contact_name: '',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('Contact name is required');
    });

    it('should reject contact for non-existent vendor', async () => {
      const token = createTestToken();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.add_contact',
          data: {
            vendor_id: 'non-existent-vendor',
            contact_name: 'Jane Doe',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('Vendor not found');
    });

    it('should traverse relationships via entity graph', async () => {
      // Verify the relationship was created by checking entity graph directly
      const contacts = await server.entityGraph.getRelatedEntities(
        'vendor', contactVendorId, 'has_contact',
      );
      expect(contacts.length).toBeGreaterThanOrEqual(1);
      expect(contacts[0].attributes.name).toBe('John Smith');
    });
  });

  // ── effective_date ──────────────────────────────────────

  describe('effective_date as DATE string', () => {
    it('should store and return effective_date as YYYY-MM-DD', async () => {
      const token = createTestToken();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Date Vendor' },
          effective_date: '2025-07-15',
          idempotency_key: 'date-vendor-1',
        },
      });

      expect(response.statusCode).toBe(201);
      const { event_id } = response.json();

      const audit = await app.inject({
        method: 'GET',
        url: `/audit/events/${event_id}`,
      });
      const event = audit.json();
      expect(event.effective_date).toBe('2025-07-15');
    });

    it('should default effective_date to today when not provided', async () => {
      const token = createTestToken();
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Default Date Vendor' },
          idempotency_key: 'default-date-vendor-1',
        },
      });

      expect(response.statusCode).toBe(201);
      const { event_id } = response.json();

      const audit = await app.inject({
        method: 'GET',
        url: `/audit/events/${event_id}`,
      });
      const event = audit.json();
      expect(event.effective_date).toBe(today);
    });
  });

  // ── NFR ─────────────────────────────────────────────────

  describe('NFR: Health endpoint', () => {
    it('should return ok health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('ok');
      expect(body.checks.database).toBe('ok');
      expect(body.timestamp).toBeTruthy();
    });
  });

  // ── Backward Compatibility ──────────────────────────────

  describe('Backward compatibility with auth', () => {
    it('should still create vendors with auth headers', async () => {
      const token = createTestToken();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Compat Vendor' },
          idempotency_key: 'compat-vendor-1',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should still create items with auth headers', async () => {
      const token = createTestToken();

      const response = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.item.create',
          data: { name: 'Compat Item', sku: 'COMPAT-001' },
          idempotency_key: 'compat-item-1',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should still update vendors with auth headers', async () => {
      const token = createTestToken();

      // Create vendor
      const createRes = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.create',
          data: { name: 'Compat Update Vendor' },
          idempotency_key: 'compat-update-vendor-1',
        },
      });
      expect(createRes.statusCode).toBe(201);

      const vendorId = createRes.json().event.entities.find(
        (e: Record<string, unknown>) => e.entity_type === 'vendor',
      ).entity_id;

      // Update vendor
      const updateRes = await app.inject({
        method: 'POST',
        url: '/intents',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'mdm.vendor.update',
          data: { vendor_id: vendorId, name: 'Compat Updated Vendor' },
          expected_entity_version: 1,
          idempotency_key: 'compat-update-vendor-2',
        },
      });

      expect(updateRes.statusCode).toBe(201);
      expect(updateRes.json().event.type).toBe('mdm.vendor.updated');
    });
  });
});
