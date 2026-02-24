import { evaluateCondition } from './condition-evaluator.js';
import type { Rule, RuleContext, RulePhase, EvaluationResult, EvaluationTrace } from './types.js';

/**
 * Filter rules to only those active at the given effective date.
 * A rule is active when effective_from <= date and (effective_to is null or date < effective_to).
 */
export function filterActiveRules(rules: Rule[], effectiveDate?: string): Rule[] {
  if (!effectiveDate) return rules;
  return rules.filter((rule) => {
    if (rule.effective_from && effectiveDate < rule.effective_from) return false;
    if (rule.effective_to && effectiveDate >= rule.effective_to) return false;
    return true;
  });
}

/**
 * Evaluate rules without phase enforcement (backward-compatible).
 * Supports optional effectiveDate to filter active rules.
 */
export function evaluate(
  rules: Rule[],
  context: RuleContext,
  effectiveDate?: string,
): EvaluationResult {
  const activeRules = filterActiveRules(rules, effectiveDate);
  const applicable = activeRules
    .filter((r) => r.intent_type === context.intent_type)
    .sort((a, b) => a.priority - b.priority);

  // Add skipped traces for inactive rules
  const inactiveTraces: EvaluationTrace[] = rules
    .filter((r) => r.intent_type === context.intent_type && !activeRules.includes(r))
    .map((r) => ({
      rule_id: r.id,
      rule_name: r.name,
      result: 'skipped_inactive' as const,
      evaluation_ms: 0,
    }));

  const { traces, decision, rejectionMessage, requiredApproverRole } =
    evaluateRuleSet(applicable, context);

  return {
    decision,
    traces: [...inactiveTraces, ...traces],
    rejection_message: rejectionMessage,
    required_approver_role: requiredApproverRole,
  };
}

/**
 * Evaluate rules with phase enforcement: validate → enrich → decide.
 *
 * Phase constraints:
 * - validate: can approve, reject, route_for_approval
 * - enrich: can only enrich (add fields to context); cannot reject or route
 * - decide: can approve, reject, route_for_approval; cannot enrich
 *
 * Rules without a phase are treated as 'validate'.
 */
export function evaluatePhased(
  rules: Rule[],
  context: RuleContext,
  effectiveDate?: string,
): EvaluationResult {
  const activeRules = filterActiveRules(rules, effectiveDate);
  const applicable = activeRules
    .filter((r) => r.intent_type === context.intent_type)
    .sort((a, b) => a.priority - b.priority);

  const phases: RulePhase[] = ['validate', 'enrich', 'decide'];
  const allTraces: EvaluationTrace[] = [];
  let finalDecision: EvaluationResult['decision'] = 'approve';
  let rejectionMessage: string | undefined;
  let requiredApproverRole: string | undefined;
  const enrichedData = { ...context.data };

  for (const phase of phases) {
    const phaseRules = applicable.filter((r) => (r.phase ?? 'validate') === phase);

    if (phase === 'enrich') {
      // Enrich phase: only 'enrich' actions allowed; reject/route_for_approval are skipped
      for (const rule of phaseRules) {
        const start = performance.now();

        if (rule.action !== 'enrich') {
          allTraces.push({
            rule_id: rule.id,
            rule_name: rule.name,
            phase,
            result: 'not_applicable',
            actions_taken: [`${rule.action}_blocked_in_enrich_phase`],
            evaluation_ms: performance.now() - start,
          });
          continue;
        }

        const allConditionsMet = rule.conditions.every((condition) =>
          evaluateCondition(condition, enrichedData),
        );
        const evaluationMs = performance.now() - start;

        if (allConditionsMet && rule.enrich_fields) {
          Object.assign(enrichedData, rule.enrich_fields);
          allTraces.push({
            rule_id: rule.id,
            rule_name: rule.name,
            phase,
            result: 'fired',
            actions_taken: ['enrich'],
            evaluation_ms: evaluationMs,
          });
        } else {
          allTraces.push({
            rule_id: rule.id,
            rule_name: rule.name,
            phase,
            result: allConditionsMet ? 'fired' : 'condition_false',
            evaluation_ms: evaluationMs,
          });
        }
      }
    } else {
      // validate or decide phase: standard evaluation but enrich actions are blocked
      for (const rule of phaseRules) {
        const start = performance.now();

        if (rule.action === 'enrich') {
          allTraces.push({
            rule_id: rule.id,
            rule_name: rule.name,
            phase,
            result: 'not_applicable',
            actions_taken: [`enrich_blocked_in_${phase}_phase`],
            evaluation_ms: performance.now() - start,
          });
          continue;
        }

        const allConditionsMet = rule.conditions.every((condition) =>
          evaluateCondition(condition, enrichedData),
        );
        const evaluationMs = performance.now() - start;

        if (allConditionsMet) {
          allTraces.push({
            rule_id: rule.id,
            rule_name: rule.name,
            phase,
            result: 'fired',
            actions_taken: [rule.action],
            evaluation_ms: evaluationMs,
          });

          if (rule.action === 'reject') {
            finalDecision = 'reject';
            rejectionMessage = rule.rejection_message;
            // Reject in validate phase short-circuits all remaining phases
            return {
              decision: finalDecision,
              traces: allTraces,
              rejection_message: rejectionMessage,
              enriched_context: enrichedData,
            };
          }

          if (rule.action === 'route_for_approval') {
            finalDecision = 'route_for_approval';
            requiredApproverRole = rule.approver_role;
          }
        } else {
          allTraces.push({
            rule_id: rule.id,
            rule_name: rule.name,
            phase,
            result: 'condition_false',
            evaluation_ms: evaluationMs,
          });
        }
      }
    }
  }

  return {
    decision: finalDecision,
    traces: allTraces,
    rejection_message: rejectionMessage,
    required_approver_role: requiredApproverRole,
    enriched_context: enrichedData,
  };
}

/**
 * Internal: evaluate a flat rule set (no phase enforcement).
 */
function evaluateRuleSet(
  rules: Rule[],
  context: RuleContext,
): {
  traces: EvaluationTrace[];
  decision: EvaluationResult['decision'];
  rejectionMessage?: string;
  requiredApproverRole?: string;
} {
  const traces: EvaluationTrace[] = [];
  let decision: EvaluationResult['decision'] = 'approve';
  let rejectionMessage: string | undefined;
  let requiredApproverRole: string | undefined;

  for (const rule of rules) {
    const start = performance.now();

    const allConditionsMet = rule.conditions.every((condition) =>
      evaluateCondition(condition, context.data),
    );

    const evaluationMs = performance.now() - start;

    if (allConditionsMet) {
      traces.push({
        rule_id: rule.id,
        rule_name: rule.name,
        phase: rule.phase,
        result: 'fired',
        actions_taken: [rule.action],
        evaluation_ms: evaluationMs,
      });

      if (rule.action === 'reject') {
        decision = 'reject';
        rejectionMessage = rule.rejection_message;
        break; // Reject takes precedence, stop evaluation
      }

      if (rule.action === 'route_for_approval') {
        decision = 'route_for_approval';
        requiredApproverRole = rule.approver_role;
      }
    } else {
      traces.push({
        rule_id: rule.id,
        rule_name: rule.name,
        phase: rule.phase,
        result: 'condition_false',
        evaluation_ms: evaluationMs,
      });
    }
  }

  return { traces, decision, rejectionMessage, requiredApproverRole };
}
