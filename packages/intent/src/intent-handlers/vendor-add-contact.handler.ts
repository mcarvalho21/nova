import pg from 'pg';
import {
  generateId,
  EventStoreService,
  EntityGraphService,
  evaluate,
  VENDOR_CONTACT_RULES,
  ValidationError,
} from '@nova/core';
import type { ProjectionEngine, RuleContext } from '@nova/core';
import type { Intent, IntentResult, IntentHandler } from '../types.js';

export class VendorAddContactHandler implements IntentHandler {
  readonly intent_type = 'mdm.vendor.add_contact';

  constructor(
    private readonly pool: pg.Pool,
    private readonly eventStore: EventStoreService,
    private readonly entityGraph: EntityGraphService,
    _projectionEngine: ProjectionEngine,
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
      const contactName = (intent.data.contact_name as string | undefined)?.trim() ?? '';
      const contactNameMissing = contactName === '';

      // Verify vendor exists in actor's legal entity
      const vendor = vendorId
        ? await this.entityGraph.getEntity('vendor', vendorId, client, legalEntity)
        : null;
      const vendorNotFound = !vendor;

      const ruleContext: RuleContext = {
        intent_type: intent.intent_type,
        data: {
          ...intent.data,
          _contact_name_missing: contactNameMissing,
          _vendor_not_found: vendorNotFound,
        },
      };

      const ruleResult = evaluate(VENDOR_CONTACT_RULES, ruleContext);

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

      // Create contact entity
      const contactId = generateId();
      const contactAttributes: Record<string, unknown> = {
        name: contactName,
        email: intent.data.email,
        phone: intent.data.phone,
      };
      await this.entityGraph.createEntity(
        'contact',
        contactId,
        contactAttributes,
        client,
        legalEntity,
      );

      // Create relationship: vendor → has_contact → contact
      await this.entityGraph.createRelationship(
        'vendor', vendorId,
        'contact', contactId,
        'has_contact',
        {},
        client,
      );

      // Append event
      const correlationId = intent.correlation_id ?? generateId();
      const event = await this.eventStore.append(
        {
          type: 'mdm.vendor.contact_added',
          actor: intent.actor,
          correlation_id: correlationId,
          intent_id: intentId,
          occurred_at: intent.occurred_at,
          effective_date: intent.effective_date,
          scope: { tenant_id: 'default', legal_entity: legalEntity },
          data: {
            vendor_id: vendorId,
            contact_id: contactId,
            contact_name: contactName,
            email: intent.data.email,
            phone: intent.data.phone,
          },
          entities: [
            { entity_type: 'vendor', entity_id: vendorId, role: 'subject' },
            { entity_type: 'contact', entity_id: contactId, role: 'created' },
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
