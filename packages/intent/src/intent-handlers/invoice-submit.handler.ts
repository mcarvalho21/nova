import pg from 'pg';
import {
  generateId,
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  evaluate,
  loadRulesFromFile,
  ValidationError,
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

export class InvoiceSubmitHandler implements IntentHandler {
  readonly intent_type = 'ap.invoice.submit';

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

      // Idempotency check
      if (intent.idempotency_key) {
        const { rows } = await client.query(
          'SELECT * FROM events WHERE idempotency_key = $1',
          [intent.idempotency_key],
        );
        if (rows.length > 0) {
          const existingEvent = await this.eventStore.getById(rows[0].id as string);
          await client.query('ROLLBACK');
          return {
            success: true,
            intent_id: intentId,
            event_id: existingEvent!.id,
            event: existingEvent!,
          };
        }
      }

      // Validate required fields
      const invoiceNumber = (intent.data.invoice_number as string | undefined)?.trim() ?? '';
      if (!invoiceNumber) {
        await client.query('ROLLBACK');
        return { success: false, intent_id: intentId, error: 'invoice_number is required' };
      }

      const vendorId = intent.data.vendor_id as string;
      if (!vendorId) {
        await client.query('ROLLBACK');
        return { success: false, intent_id: intentId, error: 'vendor_id is required' };
      }

      const amount = intent.data.amount as number;
      if (amount === undefined || amount === null) {
        await client.query('ROLLBACK');
        return { success: false, intent_id: intentId, error: 'amount is required' };
      }

      const dueDate = intent.data.due_date as string;
      if (!dueDate) {
        await client.query('ROLLBACK');
        return { success: false, intent_id: intentId, error: 'due_date is required' };
      }

      // Verify vendor exists
      const vendor = await this.entityGraph.getEntity('vendor', vendorId, client, legalEntity);
      if (!vendor) {
        await client.query('ROLLBACK');
        return { success: false, intent_id: intentId, error: `Vendor ${vendorId} not found` };
      }

      // Check for duplicate invoice (same vendor + invoice_number)
      const { rows: duplicateRows } = await client.query(
        `SELECT entity_id FROM entities
         WHERE entity_type = 'invoice'
           AND attributes->>'vendor_id' = $1
           AND attributes->>'invoice_number' = $2
           AND legal_entity = $3
         LIMIT 1`,
        [vendorId, invoiceNumber, legalEntity],
      );
      const duplicateExists = duplicateRows.length > 0;

      // Get PO if referenced
      const poId = intent.data.po_id as string | undefined;
      let poEntity: { attributes: Record<string, unknown>; version: number } | null = null;
      let matchResult: 'matched' | 'exception' | 'no_po' = 'no_po';
      let matchVariance = 0;

      if (poId) {
        poEntity = await this.entityGraph.getEntity('purchase_order', poId, client, legalEntity);
        if (poEntity) {
          const poTotal = poEntity.attributes.total as number;
          const tolerance = (intent.data.match_tolerance as number) ?? 0.01;
          const variance = Math.abs(amount - poTotal);
          matchVariance = variance;

          if (variance <= tolerance * poTotal) {
            matchResult = 'matched';
          } else {
            matchResult = 'exception';
          }
        }
      }

      // Run rules — submit rules
      const allRules = getApInvoiceRules();
      const submitRules = allRules.filter((r) => r.intent_type === 'ap.invoice.submit');

      const ruleContext: RuleContext = {
        intent_type: intent.intent_type,
        data: {
          ...intent.data,
          _duplicate_exists: duplicateExists,
          _match_result: matchResult,
          _match_variance: matchVariance,
        },
      };

      const ruleResult = evaluate(submitRules, ruleContext);

      if (ruleResult.decision === 'reject') {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: ruleResult.rejection_message ?? 'Invoice rejected by rules',
          traces: ruleResult.traces.map((t) => ({
            rule_id: t.rule_id,
            rule_name: t.rule_name,
            result: t.result,
            actions_taken: t.actions_taken,
            evaluation_ms: t.evaluation_ms,
          })),
        };
      }

      // Create invoice entity
      const invoiceId = generateId();
      const currency = (intent.data.currency as string) ?? 'USD';
      const lines = intent.data.lines as Array<Record<string, unknown>> ?? [];
      const poNumber = (intent.data.po_number as string) ?? (poEntity?.attributes.po_number as string) ?? null;

      await this.entityGraph.createEntity(
        'invoice',
        invoiceId,
        {
          invoice_number: invoiceNumber,
          vendor_id: vendorId,
          amount,
          currency,
          due_date: dueDate,
          status: 'submitted',
          lines,
          po_id: poId ?? null,
          po_number: poNumber,
          submitted_by: intent.actor.id,
        },
        client,
        legalEntity,
      );

      // Create relationship: invoice -> vendor
      await this.entityGraph.createRelationship(
        'invoice', invoiceId,
        'vendor', vendorId,
        'invoiced_to',
        {},
        client,
      );

      // If PO exists, link invoice -> PO
      if (poId) {
        await this.entityGraph.createRelationship(
          'invoice', invoiceId,
          'purchase_order', poId,
          'matched_to',
          {},
          client,
        );
      }

      // Append submitted event
      const correlationId = intent.correlation_id ?? generateId();
      const submittedEvent = await this.eventStore.append(
        {
          type: 'ap.invoice.submitted',
          actor: intent.actor,
          correlation_id: correlationId,
          intent_id: intentId,
          occurred_at: intent.occurred_at,
          effective_date: intent.effective_date,
          scope: { tenant_id: 'default', legal_entity: legalEntity },
          data: {
            invoice_number: invoiceNumber,
            vendor_id: vendorId,
            vendor_name: vendor.attributes.name as string,
            amount,
            currency,
            due_date: dueDate,
            lines,
            po_id: poId ?? null,
            po_number: poNumber,
          },
          entities: [
            { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
            { entity_type: 'vendor', entity_id: vendorId, role: 'related' },
          ],
          rules_evaluated: ruleResult.traces.map((t) => ({
            rule_id: t.rule_id,
            rule_name: t.rule_name,
            result: t.result,
            actions_taken: t.actions_taken,
            evaluation_ms: t.evaluation_ms,
          })),
          idempotency_key: intent.idempotency_key,
        },
        client,
      );

      await this.projectionEngine.processEvent(submittedEvent, client);

      // Auto-trigger 3-way match if PO was provided
      if (matchResult === 'matched') {
        // Emit matched event
        const matchedEvent = await this.eventStore.append(
          {
            type: 'ap.invoice.matched',
            actor: { type: 'system', id: 'system', name: 'Match Engine' },
            correlation_id: correlationId,
            caused_by: submittedEvent.id,
            scope: { tenant_id: 'default', legal_entity: legalEntity },
            data: {
              invoice_id: invoiceId,
              match_type: '3-way',
              po_amount: poEntity!.attributes.total as number,
              invoice_amount: amount,
              variance: matchVariance,
            },
            entities: [
              { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
            ],
          },
          client,
        );

        // Update invoice entity status — preserve submitted_by
        const matchedAttrs = {
          invoice_number: invoiceNumber,
          vendor_id: vendorId,
          amount,
          currency,
          due_date: dueDate,
          lines,
          po_id: poId,
          po_number: poNumber,
          submitted_by: intent.actor.id,
          status: 'matched',
        };
        await this.entityGraph.updateEntity(
          'invoice', invoiceId, matchedAttrs,
          1, client, legalEntity,
        );

        await this.projectionEngine.processEvent(matchedEvent, client);
      } else if (matchResult === 'exception') {
        // Emit match exception event
        const exceptionEvent = await this.eventStore.append(
          {
            type: 'ap.invoice.match_exception',
            actor: { type: 'system', id: 'system', name: 'Match Engine' },
            correlation_id: correlationId,
            caused_by: submittedEvent.id,
            scope: { tenant_id: 'default', legal_entity: legalEntity },
            data: {
              invoice_id: invoiceId,
              exception_type: 'price_variance',
              variance: matchVariance,
              po_amount: poEntity!.attributes.total as number,
              invoice_amount: amount,
            },
            entities: [
              { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
            ],
          },
          client,
        );

        const exceptionAttrs = {
          invoice_number: invoiceNumber,
          vendor_id: vendorId,
          amount,
          currency,
          due_date: dueDate,
          lines,
          po_id: poId,
          po_number: poNumber,
          submitted_by: intent.actor.id,
          status: 'match_exception',
        };
        await this.entityGraph.updateEntity(
          'invoice', invoiceId, exceptionAttrs,
          1, client, legalEntity,
        );

        await this.projectionEngine.processEvent(exceptionEvent, client);
      }

      await client.query('COMMIT');

      return {
        success: true,
        intent_id: intentId,
        event_id: submittedEvent.id,
        event: submittedEvent,
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
