import { describe, it, expect } from 'vitest';
import { evaluateCondition } from './condition-evaluator.js';

describe('ConditionEvaluator', () => {
  describe('eq operator', () => {
    it('should return true when values are equal', () => {
      expect(evaluateCondition({ field: 'name', operator: 'eq', value: 'test' }, { name: 'test' })).toBe(true);
    });

    it('should return false when values differ', () => {
      expect(evaluateCondition({ field: 'name', operator: 'eq', value: 'test' }, { name: 'other' })).toBe(false);
    });
  });

  describe('neq operator', () => {
    it('should return true when values differ', () => {
      expect(evaluateCondition({ field: 'name', operator: 'neq', value: 'test' }, { name: 'other' })).toBe(true);
    });

    it('should return false when values are equal', () => {
      expect(evaluateCondition({ field: 'name', operator: 'neq', value: 'test' }, { name: 'test' })).toBe(false);
    });
  });

  describe('not_empty operator', () => {
    it('should return true for non-empty string', () => {
      expect(evaluateCondition({ field: 'name', operator: 'not_empty' }, { name: 'hello' })).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(evaluateCondition({ field: 'name', operator: 'not_empty' }, { name: '' })).toBe(false);
    });

    it('should return false for null', () => {
      expect(evaluateCondition({ field: 'name', operator: 'not_empty' }, { name: null })).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(evaluateCondition({ field: 'name', operator: 'not_empty' }, {})).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(evaluateCondition({ field: 'items', operator: 'not_empty' }, { items: [] })).toBe(false);
    });

    it('should return true for non-empty array', () => {
      expect(evaluateCondition({ field: 'items', operator: 'not_empty' }, { items: [1] })).toBe(true);
    });
  });

  describe('in operator', () => {
    it('should return true when value is in array', () => {
      expect(evaluateCondition({ field: 'status', operator: 'in', value: ['active', 'pending'] }, { status: 'active' })).toBe(true);
    });

    it('should return false when value is not in array', () => {
      expect(evaluateCondition({ field: 'status', operator: 'in', value: ['active', 'pending'] }, { status: 'closed' })).toBe(false);
    });
  });

  describe('not_in operator', () => {
    it('should return true when value is not in array', () => {
      expect(evaluateCondition({ field: 'status', operator: 'not_in', value: ['deleted', 'archived'] }, { status: 'active' })).toBe(true);
    });

    it('should return false when value is in array', () => {
      expect(evaluateCondition({ field: 'status', operator: 'not_in', value: ['deleted', 'archived'] }, { status: 'deleted' })).toBe(false);
    });
  });

  describe('exists operator', () => {
    it('should return true when field exists', () => {
      expect(evaluateCondition({ field: 'name', operator: 'exists' }, { name: 'test' })).toBe(true);
    });

    it('should return false when field does not exist', () => {
      expect(evaluateCondition({ field: 'name', operator: 'exists' }, {})).toBe(false);
    });

    it('should return true for null values (field exists but is null)', () => {
      expect(evaluateCondition({ field: 'name', operator: 'exists' }, { name: null })).toBe(true);
    });
  });

  describe('nested field paths', () => {
    it('should resolve dot-separated paths', () => {
      expect(evaluateCondition(
        { field: 'address.city', operator: 'eq', value: 'NYC' },
        { address: { city: 'NYC' } },
      )).toBe(true);
    });

    it('should return undefined for missing intermediate path', () => {
      expect(evaluateCondition(
        { field: 'address.city', operator: 'exists' },
        { name: 'test' },
      )).toBe(false);
    });
  });
});
