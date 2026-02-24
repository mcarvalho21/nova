import type { EventActor, BaseEvent, RuleEvaluationSummary } from '@nova/core';

export interface Intent {
  intent_type: string;
  actor: EventActor;
  data: Record<string, unknown>;
  idempotency_key?: string;
  correlation_id?: string;
  occurred_at?: Date;
  effective_date?: string;
  expected_entity_version?: number;
  capabilities?: string[];
  legal_entity?: string;
}

export interface IntentResult {
  success: boolean;
  intent_id: string;
  event_id?: string;
  event?: BaseEvent;
  error?: string;
  traces?: RuleEvaluationSummary[];
  status?: 'pending_approval';
  required_approver_role?: string;
}

export interface IntentHandler {
  intent_type: string;
  execute(intent: Intent, intentId: string): Promise<IntentResult>;
}
