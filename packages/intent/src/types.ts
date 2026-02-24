import type { EventActor, BaseEvent } from '@nova/core';

export interface Intent {
  intent_type: string;
  actor: EventActor;
  data: Record<string, unknown>;
  idempotency_key?: string;
  correlation_id?: string;
  occurred_at?: Date;
  effective_date?: Date;
  expected_entity_version?: number;
}

export interface IntentResult {
  success: boolean;
  intent_id: string;
  event_id?: string;
  event?: BaseEvent;
  error?: string;
  traces?: BaseEvent['rules_evaluated'];
}

export interface IntentHandler {
  intent_type: string;
  execute(intent: Intent, intentId: string): Promise<IntentResult>;
}
