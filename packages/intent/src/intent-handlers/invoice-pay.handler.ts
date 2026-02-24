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

export class InvoicePayHandler implements IntentHandler {
  readonly intent_type = 'ap.invoice.pay';

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

      const paymentReference = (intent.data.payment_reference as string) ?? generateId();
      const paymentDate = (intent.data.payment_date as string) ?? new Date().toISOString().slice(0, 10);

      // Get invoice entity
      const invoice = await this.entityGraph.getEntity('invoice', invoiceId, client, legalEntity);
      if (!invoice) {
        await client.query('ROLLBACK');
        throw new EntityNotFoundError('invoice', invoiceId);
      }

      // Invoice must be posted to pay
      const status = invoice.attributes.status as string;
      if (status !== 'posted') {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: `Invoice must be posted before payment (current status: ${status})`,
        };
      }

      const amount = invoice.attributes.amount as number;
      const currency = (invoice.attributes.currency as string) ?? 'USD';
      const vendorId = invoice.attributes.vendor_id as string;

      // Append paid event
      const correlationId = intent.correlation_id ?? generateId();
      const event = await this.eventStore.append(
        {
          type: 'ap.invoice.paid',
          actor: intent.actor,
          correlation_id: correlationId,
          intent_id: intentId,
          occurred_at: intent.occurred_at,
          effective_date: intent.effective_date,
          scope: { tenant_id: 'default', legal_entity: legalEntity },
          data: {
            invoice_id: invoiceId,
            payment_reference: paymentReference,
            payment_date: paymentDate,
            amount,
            currency,
            vendor_id: vendorId,
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
        { ...invoice.attributes, status: 'paid', payment_reference: paymentReference, payment_date: paymentDate },
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
