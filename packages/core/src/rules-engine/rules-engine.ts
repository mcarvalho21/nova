import { evaluateCondition } from './condition-evaluator.js';
import type { Rule, RuleContext, EvaluationResult, EvaluationTrace } from './types.js';

export function evaluate(rules: Rule[], context: RuleContext): EvaluationResult {
  const applicable = rules
    .filter((r) => r.intent_type === context.intent_type)
    .sort((a, b) => a.priority - b.priority);

  const traces: EvaluationTrace[] = [];
  let decision: 'approve' | 'reject' = 'approve';
  let rejectionMessage: string | undefined;

  for (const rule of applicable) {
    const start = performance.now();

    const allConditionsMet = rule.conditions.every((condition) =>
      evaluateCondition(condition, context.data),
    );

    const evaluationMs = performance.now() - start;

    if (allConditionsMet) {
      traces.push({
        rule_id: rule.id,
        rule_name: rule.name,
        result: 'fired',
        actions_taken: [rule.action],
        evaluation_ms: evaluationMs,
      });

      if (rule.action === 'reject') {
        decision = 'reject';
        rejectionMessage = rule.rejection_message;
        break;
      }
    } else {
      traces.push({
        rule_id: rule.id,
        rule_name: rule.name,
        result: 'condition_false',
        evaluation_ms: evaluationMs,
      });
    }
  }

  return { decision, traces, rejection_message: rejectionMessage };
}
