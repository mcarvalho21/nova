import pg from 'pg';
import {
  generateId,
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  ValidationError,
} from '@nova/core';
import type { Intent, IntentResult, IntentHandler } from '../types.js';

export class PurchaseOrderCreateHandler implements IntentHandler {
  readonly intent_type = 'ap.purchase_order.create';

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

      const poNumber = (intent.data.po_number as string | undefined)?.trim() ?? '';
      if (!poNumber) {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: 'PO number is required',
        };
      }

      const vendorId = intent.data.vendor_id as string;
      if (!vendorId) {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: 'vendor_id is required',
        };
      }

      // Verify vendor exists
      const vendor = await this.entityGraph.getEntity('vendor', vendorId, client, legalEntity);
      if (!vendor) {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: `Vendor ${vendorId} not found`,
        };
      }

      // Create PO entity
      const poId = generateId();
      const total = intent.data.total as number ?? 0;
      const currency = (intent.data.currency as string) ?? 'USD';
      const lines = intent.data.lines as Array<Record<string, unknown>> ?? [];

      await this.entityGraph.createEntity(
        'purchase_order',
        poId,
        {
          po_number: poNumber,
          vendor_id: vendorId,
          total,
          currency,
          status: 'open',
          lines,
        },
        client,
        legalEntity,
      );

      // Create relationship: PO -> vendor
      await this.entityGraph.createRelationship(
        'purchase_order', poId,
        'vendor', vendorId,
        'ordered_from',
        {},
        client,
      );

      // Append event
      const correlationId = intent.correlation_id ?? generateId();
      const event = await this.eventStore.append(
        {
          type: 'ap.purchase_order.created',
          actor: intent.actor,
          correlation_id: correlationId,
          intent_id: intentId,
          occurred_at: intent.occurred_at,
          effective_date: intent.effective_date,
          scope: { tenant_id: 'default', legal_entity: legalEntity },
          data: {
            po_number: poNumber,
            vendor_id: vendorId,
            vendor_name: vendor.attributes.name as string,
            total,
            currency,
            lines,
          },
          entities: [
            { entity_type: 'purchase_order', entity_id: poId, role: 'subject' },
            { entity_type: 'vendor', entity_id: vendorId, role: 'related' },
          ],
          idempotency_key: intent.idempotency_key,
        },
        client,
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
