export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'not_empty'
  | 'in'
  | 'not_in'
  | 'exists';

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  priority: number;
  intent_type: string;
  conditions: Condition[];
  action: 'approve' | 'reject';
  rejection_message?: string;
}

export interface RuleContext {
  intent_type: string;
  data: Record<string, unknown>;
  existing_entities?: Record<string, unknown>[];
}

export interface EvaluationTrace {
  rule_id: string;
  rule_name: string;
  result: 'fired' | 'not_applicable' | 'condition_false';
  actions_taken?: string[];
  evaluation_ms: number;
}

export interface EvaluationResult {
  decision: 'approve' | 'reject';
  traces: EvaluationTrace[];
  rejection_message?: string;
}
