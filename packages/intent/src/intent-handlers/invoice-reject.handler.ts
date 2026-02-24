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

export class InvoiceRejectHandler implements IntentHandler {
  readonly intent_type = 'ap.invoice.reject';

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

      const rejectionReason = (intent.data.rejection_reason as string) ?? 'No reason provided';

      // Get invoice entity
      const invoice = await this.entityGraph.getEntity('invoice', invoiceId, client, legalEntity);
      if (!invoice) {
        await client.query('ROLLBACK');
        throw new EntityNotFoundError('invoice', invoiceId);
      }

      // Verify invoice can be rejected
      const status = invoice.attributes.status as string;
      if (status === 'paid' || status === 'cancelled') {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: `Invoice cannot be rejected in status: ${status}`,
        };
      }

      // Append rejected event
      const correlationId = intent.correlation_id ?? generateId();
      const event = await this.eventStore.append(
        {
          type: 'ap.invoice.rejected',
          actor: intent.actor,
          correlation_id: correlationId,
          intent_id: intentId,
          occurred_at: intent.occurred_at,
          effective_date: intent.effective_date,
          scope: { tenant_id: 'default', legal_entity: legalEntity },
          data: {
            invoice_id: invoiceId,
            rejection_reason: rejectionReason,
            amount: invoice.attributes.amount,
            vendor_id: invoice.attributes.vendor_id,
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
        { ...invoice.attributes, status: 'rejected' },
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
