import pg from 'pg';
import {
  generateId,
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  EntityNotFoundError,
  ValidationError,
} from '@nova/core';
import type { Intent, IntentResult, IntentHandler } from '../types.js';

export class InvoicePostHandler implements IntentHandler {
  readonly intent_type = 'ap.invoice.post';

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

      // Invoice must be approved to post
      const status = invoice.attributes.status as string;
      if (status !== 'approved') {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: `Invoice must be approved before posting (current status: ${status})`,
        };
      }

      const amount = invoice.attributes.amount as number;
      const currency = (invoice.attributes.currency as string) ?? 'USD';
      const vendorId = invoice.attributes.vendor_id as string;

      // Build GL entries
      const expenseAccount = (intent.data.expense_account as string) ?? '5000-00';
      const glEntries = (intent.data.gl_entries as Array<{
        account_code: string;
        debit: number;
        credit: number;
        description?: string;
      }>) ?? [
        { account_code: expenseAccount, debit: amount, credit: 0, description: 'AP Invoice posted - expense' },
        { account_code: '2100-00', debit: 0, credit: amount, description: 'AP Invoice posted - AP control' },
      ];

      // Append posted event
      const correlationId = intent.correlation_id ?? generateId();
      const event = await this.eventStore.append(
        {
          type: 'ap.invoice.posted',
          actor: intent.actor,
          correlation_id: correlationId,
          intent_id: intentId,
          occurred_at: intent.occurred_at,
          effective_date: intent.effective_date,
          scope: { tenant_id: 'default', legal_entity: legalEntity },
          data: {
            invoice_id: invoiceId,
            amount,
            currency,
            vendor_id: vendorId,
            gl_entries: glEntries,
            expense_account: expenseAccount,
          },
          entities: [
            { entity_type: 'invoice', entity_id: invoiceId, role: 'subject' },
          ],
          expected_entity_version: invoice.version,
          idempotency_key: intent.idempotency_key,
        },
        client,
      );

      await this.entityGraph.updateEntity(
        'invoice', invoiceId,
        { ...invoice.attributes, status: 'posted' },
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
