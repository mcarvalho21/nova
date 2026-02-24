export interface EventScope {
  tenant_id: string;
  legal_entity: string;
}

export interface EventActor {
  type: 'human' | 'agent' | 'system' | 'external' | 'import';
  id: string;
  name: string;
}

export interface EntityReference {
  entity_type: string;
  entity_id: string;
  role: string;
}

export interface RuleEvaluationSummary {
  rule_id: string;
  rule_name: string;
  result: 'fired' | 'not_applicable' | 'condition_false';
  actions_taken?: string[];
  evaluation_ms: number;
}

export interface EventSource {
  system: string;
  channel: string;
  reference?: string;
}

export interface BaseEvent {
  id: string;
  sequence: bigint;
  type: string;
  schema_version: number;
  occurred_at: Date;
  recorded_at: Date;
  effective_date: Date;
  scope: EventScope;
  actor: EventActor;
  caused_by?: string;
  intent_id?: string;
  correlation_id: string;
  data: Record<string, unknown>;
  dimensions: Record<string, string>;
  entities: EntityReference[];
  rules_evaluated: RuleEvaluationSummary[];
  tags: string[];
  source: EventSource;
  idempotency_key?: string;
}

export interface AppendEventInput {
  type: string;
  schema_version?: number;
  occurred_at?: Date;
  effective_date?: Date;
  scope?: EventScope;
  actor: EventActor;
  caused_by?: string;
  intent_id?: string;
  correlation_id: string;
  data: Record<string, unknown>;
  dimensions?: Record<string, string>;
  entities?: EntityReference[];
  rules_evaluated?: RuleEvaluationSummary[];
  tags?: string[];
  source?: EventSource;
  idempotency_key?: string;
}

export interface EventPage {
  events: BaseEvent[];
  has_more: boolean;
  next_sequence?: bigint;
}

export interface ReadStreamParams {
  after_sequence?: bigint;
  limit?: number;
  event_types?: string[];
}
