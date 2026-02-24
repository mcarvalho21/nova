import pg from 'pg';
import {
  generateId,
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  ConcurrencyConflictError,
  EntityNotFoundError,
} from '@nova/core';
import type { Intent, IntentResult, IntentHandler } from '../types.js';

export class VendorUpdateHandler implements IntentHandler {
  readonly intent_type = 'mdm.vendor.update';

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

      const vendorId = intent.data.vendor_id as string;
      if (!vendorId) {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: 'vendor_id is required for vendor update',
        };
      }

      // Get current entity
      const entity = await this.entityGraph.getEntity('vendor', vendorId, client);
      if (!entity) {
        await client.query('ROLLBACK');
        throw new EntityNotFoundError('vendor', vendorId);
      }

      // Scope check: entity must belong to actor's legal entity
      if (entity.legal_entity !== legalEntity) {
        await client.query('ROLLBACK');
        throw new EntityNotFoundError('vendor', vendorId);
      }

      // OCC check at handler level
      const expectedVersion = intent.expected_entity_version;
      if (expectedVersion !== undefined && entity.version !== expectedVersion) {
        await client.query('ROLLBACK');
        throw new ConcurrencyConflictError(vendorId, expectedVersion, entity.version);
      }

      // Merge attributes
      const updatedAttributes = {
        ...entity.attributes,
        ...intent.data,
      };
      delete updatedAttributes.vendor_id;

      // Append event FIRST (event store OCC check verifies entity is still at expected version)
      const correlationId = intent.correlation_id ?? generateId();
      const event = await this.eventStore.append(
        {
          type: 'mdm.vendor.updated',
          actor: intent.actor,
          correlation_id: correlationId,
          intent_id: intentId,
          occurred_at: intent.occurred_at,
          effective_date: intent.effective_date,
          scope: { tenant_id: 'default', legal_entity: legalEntity },
          data: updatedAttributes,
          entities: [{ entity_type: 'vendor', entity_id: vendorId, role: 'subject' }],
          expected_entity_version: entity.version,
          idempotency_key: intent.idempotency_key,
        },
        client,
      );

      // Update entity AFTER event (entity state is derived from events)
      await this.entityGraph.updateEntity(
        'vendor',
        vendorId,
        updatedAttributes,
        entity.version,
        client,
        legalEntity,
      );

      // Update projection synchronously
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
      throw error;
    } finally {
      client.release();
    }
  }
}
