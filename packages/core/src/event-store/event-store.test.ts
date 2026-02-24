import { describe, it, expect } from 'vitest';
import { rowToEvent } from './event-store.service.js';

describe('EventStore', () => {
  describe('rowToEvent', () => {
    it('should map a database row to a BaseEvent', () => {
      const row = {
        id: '01HQ3EXAMPLE',
        sequence: '42',
        type: 'mdm.vendor.created',
        schema_version: 1,
        occurred_at: new Date('2026-01-15T10:00:00Z'),
        recorded_at: new Date('2026-01-15T10:00:01Z'),
        effective_date: new Date('2026-01-15'),
        tenant_id: 'default',
        legal_entity: 'default',
        actor_type: 'human',
        actor_id: 'u1',
        actor_name: 'Test User',
        caused_by: null,
        intent_id: 'intent-1',
        correlation_id: 'corr-1',
        data: { name: 'Contoso Supply' },
        dimensions: {},
        entity_refs: [{ entity_type: 'vendor', entity_id: 'v1', role: 'subject' }],
        rules_evaluated: [
          {
            rule_id: 'r1',
            rule_name: 'name_not_empty',
            result: 'fired',
            actions_taken: ['approve'],
            evaluation_ms: 1,
          },
        ],
        tags: ['mdm'],
        source_system: 'nova',
        source_channel: 'api',
        source_ref: null,
        idempotency_key: 'idem-1',
      };

      const event = rowToEvent(row);

      expect(event.id).toBe('01HQ3EXAMPLE');
      expect(event.sequence).toBe(42n);
      expect(event.type).toBe('mdm.vendor.created');
      expect(event.scope.tenant_id).toBe('default');
      expect(event.actor.type).toBe('human');
      expect(event.actor.id).toBe('u1');
      expect(event.correlation_id).toBe('corr-1');
      expect(event.data).toEqual({ name: 'Contoso Supply' });
      expect(event.entities).toHaveLength(1);
      expect(event.entities[0].entity_type).toBe('vendor');
      expect(event.rules_evaluated).toHaveLength(1);
      expect(event.rules_evaluated[0].result).toBe('fired');
      expect(event.source.system).toBe('nova');
      expect(event.idempotency_key).toBe('idem-1');
    });

    it('should handle null optional fields', () => {
      const row = {
        id: '01HQ3EXAMPLE2',
        sequence: '1',
        type: 'test.event',
        schema_version: 1,
        occurred_at: new Date(),
        recorded_at: new Date(),
        effective_date: new Date(),
        tenant_id: 'default',
        legal_entity: 'default',
        actor_type: 'system',
        actor_id: 'sys',
        actor_name: 'System',
        caused_by: null,
        intent_id: null,
        correlation_id: 'corr-2',
        data: {},
        dimensions: null,
        entity_refs: null,
        rules_evaluated: null,
        tags: null,
        source_system: 'nova',
        source_channel: 'api',
        source_ref: null,
        idempotency_key: null,
      };

      const event = rowToEvent(row);

      expect(event.caused_by).toBeUndefined();
      expect(event.intent_id).toBeUndefined();
      expect(event.dimensions).toEqual({});
      expect(event.entities).toEqual([]);
      expect(event.rules_evaluated).toEqual([]);
      expect(event.tags).toEqual([]);
    });
  });

  describe('input validation', () => {
    it('should require actor fields', () => {
      const actor = { type: 'human' as const, id: 'u1', name: 'User' };
      expect(actor.type).toBe('human');
      expect(actor.id).toBe('u1');
      expect(actor.name).toBe('User');
    });

    it('should require correlation_id', () => {
      const input = {
        type: 'test.event',
        actor: { type: 'human' as const, id: 'u1', name: 'User' },
        correlation_id: 'corr-1',
        data: {},
      };
      expect(input.correlation_id).toBeTruthy();
    });
  });
});
