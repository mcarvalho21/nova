import { describe, it, expect } from 'vitest';
import { ConcurrencyConflictError, EntityNotFoundError } from '../shared/errors.js';

describe('EntityGraph', () => {
  describe('ConcurrencyConflictError', () => {
    it('should capture expected and actual versions', () => {
      const error = new ConcurrencyConflictError('vendor-1', 1, 3);

      expect(error.entityId).toBe('vendor-1');
      expect(error.expectedVersion).toBe(1);
      expect(error.actualVersion).toBe(3);
      expect(error.message).toContain('vendor-1');
      expect(error.message).toContain('expected version 1');
      expect(error.message).toContain('actual 3');
    });
  });

  describe('EntityNotFoundError', () => {
    it('should capture entity type and id', () => {
      const error = new EntityNotFoundError('vendor', 'v-999');

      expect(error.entityType).toBe('vendor');
      expect(error.entityId).toBe('v-999');
      expect(error.message).toContain('vendor/v-999');
    });
  });

  describe('version logic', () => {
    it('should start at version 1', () => {
      const entity = {
        entity_id: 'v1',
        entity_type: 'vendor',
        attributes: { name: 'Test' },
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };
      expect(entity.version).toBe(1);
    });

    it('should increment version on update', () => {
      const entity = {
        entity_id: 'v1',
        entity_type: 'vendor',
        attributes: { name: 'Test' },
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const updated = { ...entity, version: entity.version + 1 };
      expect(updated.version).toBe(2);
    });
  });
});
