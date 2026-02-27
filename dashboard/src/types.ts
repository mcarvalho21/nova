// --- Events ---

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

export interface RuleEvaluation {
  rule_id: string;
  rule_name: string;
  result: 'fired' | 'not_applicable' | 'condition_false' | 'skipped_inactive';
  actions_taken?: string[];
  evaluation_ms: number;
}

export interface NovaEvent {
  id: string;
  type: string;
  schema_version: number;
  sequence: string;
  occurred_at: string;
  recorded_at: string;
  effective_date: string;
  scope: { tenant_id: string; legal_entity: string };
  actor: EventActor;
  caused_by?: string;
  intent_id?: string;
  correlation_id: string;
  data: Record<string, unknown>;
  dimensions: Record<string, string>;
  entities: EntityReference[];
  rules_evaluated: RuleEvaluation[];
  tags: string[];
  source: { system: string; channel: string; reference?: string };
  idempotency_key?: string;
}

export interface EventPage {
  events: NovaEvent[];
  has_more: boolean;
  next_sequence: string | null;
}

// --- Health ---

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: { database: 'ok' | 'error' };
}

// --- AP Invoice ---

export interface ApInvoice {
  invoice_id: string;
  invoice_number: string;
  vendor_id: string;
  vendor_name: string;
  po_id: string | null;
  po_number: string | null;
  amount: number;
  currency: string;
  due_date: string;
  status: 'submitted' | 'matched' | 'match_exception' | 'approved' | 'rejected' | 'posted' | 'paid' | 'cancelled';
  submitted_by_id: string;
  submitted_by_name: string;
  approved_by_id: string | null;
  approved_by_name: string | null;
  rejection_reason: string | null;
  payment_reference: string | null;
  payment_date: string | null;
  match_variance: number | null;
  created_at: string;
  updated_at: string;
  legal_entity: string;
  last_event_id: string;
}

// --- AP Aging ---

export interface ApAgingRow {
  id: string;
  legal_entity: string;
  vendor_id: string;
  invoice_id: string;
  amount: number;
  currency: string;
  due_date: string;
  aging_bucket: string;
  status: string;
  last_event_id: string;
  updated_at: string;
}

// --- AP Vendor Balance ---

export interface VendorBalance {
  vendor_id: string;
  legal_entity: string;
  outstanding_amount: number;
  currency: string;
  invoice_count: number;
  last_event_id: string;
  updated_at: string;
}

// --- GL Postings ---

export interface GlPosting {
  posting_id: string;
  legal_entity: string;
  event_id: string;
  event_type: string;
  invoice_id: string;
  account_code: string;
  debit: number;
  credit: number;
  currency: string;
  description: string;
  posted_at: string;
}

// --- Intent ---

export interface IntentResponse {
  intent_id: string;
  event_id?: string;
  event?: NovaEvent;
  status?: string;
  required_approver_role?: string;
}

export interface IntentError {
  error: string;
  message: string;
  intent_id?: string;
  traces?: RuleEvaluation[];
}
