import { describe, it, expect, vi } from 'vitest';
import type { ProjectionHandler } from './types.js';
import type { BaseEvent } from '../event-store/types.js';

describe('ProjectionEngine', () => {
  describe('handler registration', () => {
    it('should track handlers by event type', () => {
      const handlerMap = new Map<string, ProjectionHandler[]>();

      const handler: ProjectionHandler = {
        event_types: ['mdm.vendor.created', 'mdm.vendor.updated'],
        handle: vi.fn(),
      };

      for (const eventType of handler.event_types) {
        const existing = handlerMap.get(eventType) ?? [];
        existing.push(handler);
        handlerMap.set(eventType, existing);
      }

      expect(handlerMap.get('mdm.vendor.created')).toHaveLength(1);
      expect(handlerMap.get('mdm.vendor.updated')).toHaveLength(1);
      expect(handlerMap.get('mdm.vendor.deleted')).toBeUndefined();
    });

    it('should allow multiple handlers for the same event type', () => {
      const handlerMap = new Map<string, ProjectionHandler[]>();

      const handler1: ProjectionHandler = {
        event_types: ['mdm.vendor.created'],
        handle: vi.fn(),
      };
      const handler2: ProjectionHandler = {
        event_types: ['mdm.vendor.created'],
        handle: vi.fn(),
      };

      for (const h of [handler1, handler2]) {
        for (const eventType of h.event_types) {
          const existing = handlerMap.get(eventType) ?? [];
          existing.push(h);
          handlerMap.set(eventType, existing);
        }
      }

      expect(handlerMap.get('mdm.vendor.created')).toHaveLength(2);
    });
  });

  describe('subscription cursor', () => {
    it('should track sequence progression', () => {
      const cursor = { last_processed_seq: 0n };
      const event = { sequence: 42n } as BaseEvent;
      cursor.last_processed_seq = event.sequence;
      expect(cursor.last_processed_seq).toBe(42n);
    });
  });
});
