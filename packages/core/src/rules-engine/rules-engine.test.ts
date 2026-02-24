import { describe, it, expect } from 'vitest';
import { evaluate } from './rules-engine.js';
import type { Rule, RuleContext } from './types.js';

describe('RulesEngine', () => {
  it('should approve when no reject rules fire', () => {
    const rules: Rule[] = [
      {
        id: 'rule-1',
        name: 'reject_if_empty',
        description: 'Reject if name is empty',
        priority: 1,
        intent_type: 'test.create',
        conditions: [{ field: 'name', operator: 'eq', value: '' }],
        action: 'reject',
        rejection_message: 'Name is required',
      },
      {
        id: 'rule-2',
        name: 'reject_if_inactive',
        description: 'Reject if status is inactive',
        priority: 2,
        intent_type: 'test.create',
        conditions: [{ field: 'status', operator: 'eq', value: 'inactive' }],
        action: 'reject',
        rejection_message: 'Status must be active',
      },
    ];

    const context: RuleContext = {
      intent_type: 'test.create',
      data: { name: 'Test', status: 'active' },
    };

    const result = evaluate(rules, context);

    expect(result.decision).toBe('approve');
    expect(result.traces).toHaveLength(2);
    expect(result.traces[0].result).toBe('condition_false');
    expect(result.traces[1].result).toBe('condition_false');
  });

  it('should reject when a reject rule fires', () => {
    const rules: Rule[] = [
      {
        id: 'rule-a',
        name: 'name_required',
        description: 'Name must not be empty',
        priority: 1,
        intent_type: 'test.create',
        conditions: [{ field: 'name', operator: 'eq', value: '' }],
        action: 'reject',
        rejection_message: 'Name is required',
      },
    ];

    const context: RuleContext = {
      intent_type: 'test.create',
      data: { name: '' },
    };

    const result = evaluate(rules, context);

    expect(result.decision).toBe('reject');
    expect(result.rejection_message).toBe('Name is required');
    expect(result.traces).toHaveLength(1);
    expect(result.traces[0].result).toBe('fired');
    expect(result.traces[0].actions_taken).toEqual(['reject']);
  });

  it('should approve when reject conditions are not met', () => {
    const rules: Rule[] = [
      {
        id: 'rule-a',
        name: 'name_required',
        description: 'Reject if name is empty',
        priority: 1,
        intent_type: 'test.create',
        conditions: [{ field: 'name', operator: 'eq', value: '' }],
        action: 'reject',
        rejection_message: 'Name is required',
      },
    ];

    const context: RuleContext = {
      intent_type: 'test.create',
      data: { name: 'Valid Name' },
    };

    const result = evaluate(rules, context);

    expect(result.decision).toBe('approve');
    expect(result.traces).toHaveLength(1);
    expect(result.traces[0].result).toBe('condition_false');
  });

  it('should include trace with timing for each rule', () => {
    const rules: Rule[] = [
      {
        id: 'rule-a',
        name: 'check_a',
        description: 'Check A',
        priority: 1,
        intent_type: 'test.create',
        conditions: [{ field: 'x', operator: 'exists' }],
        action: 'approve',
      },
    ];

    const context: RuleContext = {
      intent_type: 'test.create',
      data: { x: 1 },
    };

    const result = evaluate(rules, context);

    expect(result.traces[0].rule_id).toBe('rule-a');
    expect(result.traces[0].rule_name).toBe('check_a');
    expect(typeof result.traces[0].evaluation_ms).toBe('number');
    expect(result.traces[0].evaluation_ms).toBeGreaterThanOrEqual(0);
  });

  it('should evaluate rules in priority order', () => {
    const rules: Rule[] = [
      {
        id: 'low-priority',
        name: 'low',
        description: 'Low priority',
        priority: 10,
        intent_type: 'test.create',
        conditions: [{ field: 'x', operator: 'exists' }],
        action: 'approve',
      },
      {
        id: 'high-priority',
        name: 'high',
        description: 'High priority',
        priority: 1,
        intent_type: 'test.create',
        conditions: [{ field: 'x', operator: 'exists' }],
        action: 'approve',
      },
    ];

    const context: RuleContext = {
      intent_type: 'test.create',
      data: { x: 1 },
    };

    const result = evaluate(rules, context);

    expect(result.traces[0].rule_id).toBe('high-priority');
    expect(result.traces[1].rule_id).toBe('low-priority');
  });

  it('should skip rules for non-matching intent types', () => {
    const rules: Rule[] = [
      {
        id: 'rule-a',
        name: 'other_rule',
        description: 'Other intent',
        priority: 1,
        intent_type: 'other.intent',
        conditions: [{ field: 'x', operator: 'exists' }],
        action: 'reject',
        rejection_message: 'Should not fire',
      },
    ];

    const context: RuleContext = {
      intent_type: 'test.create',
      data: { x: 1 },
    };

    const result = evaluate(rules, context);

    expect(result.decision).toBe('approve');
    expect(result.traces).toHaveLength(0);
  });
});
