import pg from 'pg';
import {
  generateId,
  EventStoreService,
  EntityGraphService,
  ProjectionEngine,
  evaluate,
  ITEM_CREATE_RULES,
  ValidationError,
} from '@nova/core';
import type { RuleContext } from '@nova/core';
import type { Intent, IntentResult, IntentHandler } from '../types.js';

export class ItemCreateHandler implements IntentHandler {
  readonly intent_type = 'mdm.item.create';

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

      const name = (intent.data.name as string | undefined)?.trim() ?? '';
      const sku = (intent.data.sku as string | undefined)?.trim();
      const nameMissing = name === '';

      // Check for duplicate SKU (only if SKU is provided, scoped to legal entity)
      let skuDuplicateExists = false;
      if (sku) {
        const existing = await this.entityGraph.getEntityByTypeAndAttribute(
          'item', 'sku', sku, client, legalEntity,
        );
        skuDuplicateExists = existing !== null;
      }

      const ruleContext: RuleContext = {
        intent_type: intent.intent_type,
        data: {
          ...intent.data,
          name,
          _name_missing: nameMissing,
          _sku_duplicate_exists: skuDuplicateExists,
        },
      };

      const ruleResult = evaluate(ITEM_CREATE_RULES, ruleContext);

      if (ruleResult.decision === 'reject') {
        await client.query('ROLLBACK');
        return {
          success: false,
          intent_id: intentId,
          error: ruleResult.rejection_message ?? 'Intent rejected by rules',
          traces: ruleResult.traces.map((t) => ({
            rule_id: t.rule_id,
            rule_name: t.rule_name,
            result: t.result,
            actions_taken: t.actions_taken,
            evaluation_ms: t.evaluation_ms,
          })),
        };
      }

      // Create entity
      const itemId = generateId();
      await this.entityGraph.createEntity(
        'item',
        itemId,
        { name, sku, ...intent.data },
        client,
        legalEntity,
      );

      // Append event
      const correlationId = intent.correlation_id ?? generateId();
      const event = await this.eventStore.append(
        {
          type: 'mdm.item.created',
          actor: intent.actor,
          correlation_id: correlationId,
          intent_id: intentId,
          occurred_at: intent.occurred_at,
          effective_date: intent.effective_date,
          scope: { tenant_id: 'default', legal_entity: legalEntity },
          data: { name, sku, ...intent.data },
          entities: [{ entity_type: 'item', entity_id: itemId, role: 'subject' }],
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

      if (error instanceof ValidationError) {
        return {
          success: false,
          intent_id: intentId,
          error: error.message,
        };
      }

      throw error;
    } finally {
      client.release();
    }
  }
}
