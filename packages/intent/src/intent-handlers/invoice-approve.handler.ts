import pg from 'pg';
import {
  generateId,
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  EntityNotFoundError,
  ValidationError,
  evaluate,
  loadRulesFromFile,
} from '@nova/core';
import type { Rule, RuleContext } from '@nova/core';
import type { Intent, IntentResult, IntentHandler } from '../types.js';

let cachedRules: Rule[] | null = null;

function getApInvoiceRules(): Rule[] {
  if (cachedRules) return cachedRules;
  try {
    cachedRules = loadRulesFromFile('config/rules/ap-invoice.yaml');
  } catch {
    cachedRules = [];
  }
  return cachedRules;
}

export class InvoiceApproveHandler implements IntentHandler {
  readonly intent_type = 'ap.invoice.approve';

  constructor(
    private readonly pool: pg.Pool,
    private readonly eventStore: EventStoreService,
    private readonly entityGraph: EntityGraphService,
    private readonly projectionEngine: ProjectionEngine,
  ) {}

  async execute(intent: Intent, intentId: string): Promise<IntentResult> {
    const client = await this.pool.connect();
    const legalEntity = intent.legal_entity ?? 'default';

    try {
      await client.query('BEGIN');

      const invoiceId = intent.data.invoice_id as string;
      if (!invoiceId) {
        await client.query('ROLLBACK');
        return { success: false, intent_id: intentId, error: 'invoice_id is required' };
      }

      // Get invoice entity
      const invoice = await this.entityGraph.getEntity('invoice', invoiceId, client, legalEntity);
      if (!invoice) {
        await client.query('ROLLBACK');
        throw new EntityNotFoundError('invoice', invoiceId);
      }

      // Verify invoice is in a state that can be approved
      const status = invoice.attributes.status as string;
      if (status !== 'matched' && status !== 'submitted') {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: `Invoice cannot be approved in status: ${status}`,
        };
      }

      // SoD check: approver must not be the submitter
      const submittedBy = invoice.attributes.submitted_by as string;
      const isSubmitter = intent.actor.id === submittedBy;

      // Run approval rules
      const allRules = getApInvoiceRules();
      const approveRules = allRules.filter((r) => r.intent_type === 'ap.invoice.approve');

      const ruleContext: RuleContext = {
        intent_type: intent.intent_type,
        data: {
          ...intent.data,
          amount: invoice.attributes.amount as number,
          _submitter_is_approver: isSubmitter,
        },
        entity: invoice.attributes,
      };

      const ruleResult = evaluate(approveRules, ruleContext);

      if (ruleResult.decision === 'reject') {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: ruleResult.rejection_message ?? 'Approval rejected by rules',
          traces: ruleResult.traces.map((t) => ({
            rule_id: t.rule_id,
            rule_name: t.rule_name,
            result: t.result,
            actions_taken: t.actions_taken,
            evaluation_ms: t.evaluation_ms,
          })),
        };
      }

      if (ruleResult.decision === 'route_for_approval') {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          status: 'pending_approval',
          required_approver_role: ruleResult.required_approver_role,
          traces: ruleResult.traces.map((t) => ({
            rule_id: t.rule_id,
            rule_name: t.rule_name,
            result: t.result,
            actions_taken: t.actions_taken,
            evaluation_ms: t.evaluation_ms,
          })),
        };
      }

      // Append approved event
      const correlationId = intent.correlation_id ?? generateId();
      const event = await this.eventStore.append(
        {
          type: 'ap.invoice.approved',
          actor: intent.actor,
          correlation_id: correlationId,
          intent_id: intentId,
          occurred_at: intent.occurred_at,
          effective_date: intent.effective_date,
          scope: { tenant_id: 'default', legal_entity: legalEntity },
          data: {
            invoice_id: invoiceId,
            approved_by_id: intent.actor.id,
            approved_by_name: intent.actor.name,
            amount: invoice.attributes.amount,
            vendor_id: invoice.attributes.vendor_id,
          },
          entities: [
            { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
          ],
          rules_evaluated: ruleResult.traces.map((t) => ({
            rule_id: t.rule_id,
            rule_name: t.rule_name,
            result: t.result,
            actions_taken: t.actions_taken,
            evaluation_ms: t.evaluation_ms,
          })),
          expected_entity_version: invoice.version,
          idempotency_key: intent.idempotency_key,
        },
        client,
      );

      // Update invoice entity
      await this.entityGraph.updateEntity(
        'invoice', invoiceId,
        { ...invoice.attributes, status: 'approved', approved_by: intent.actor.id },
        invoice.version, client, legalEntity,
      );

      await this.projectionEngine.processEvent(event, client);
      await client.query('COMMIT');

      return {
        success: true,
        intent_id: intentId,
        event_id: event.id,
        event,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof ValidationError) {
        return { success: false, intent_id: intentId, error: error.message };
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
