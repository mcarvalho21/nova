export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'not_empty'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'matches';

export type RulePhase = 'validate' | 'enrich' | 'decide';

export type RuleAction = 'approve' | 'reject' | 'route_for_approval' | 'enrich';

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
  action: RuleAction;
  rejection_message?: string;
  approver_role?: string;
  phase?: RulePhase;
  effective_from?: string; // ISO date (YYYY-MM-DD)
  effective_to?: string;   // ISO date (YYYY-MM-DD)
  enrich_fields?: Record<string, unknown>; // Fields to add to context during enrich phase
}

export interface RuleContext {
  intent_type: string;
  data: Record<string, unknown>;
  event?: Record<string, unknown>;
  entity?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  existing_entities?: Record<string, unknown>[];
}

export interface EvaluationTrace {
  rule_id: string;
  rule_name: string;
  phase?: RulePhase;
  result: 'fired' | 'not_applicable' | 'condition_false' | 'skipped_inactive';
  actions_taken?: string[];
  evaluation_ms: number;
}

export interface EvaluationResult {
  decision: 'approve' | 'reject' | 'route_for_approval';
  traces: EvaluationTrace[];
  rejection_message?: string;
  required_approver_role?: string;
  enriched_context?: Record<string, unknown>;
}
