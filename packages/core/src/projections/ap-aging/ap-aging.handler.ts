import type pg from 'pg';
import type { BaseEvent } from '../../event-store/types.js';
import type { ProjectionHandler } from '../../projection-engine/types.js';
import { generateId } from '../../shared/types.js';
import { AP_AGING_QUERIES } from './ap-aging.queries.js';

/**
 * Calculate aging bucket based on due date relative to a reference date.
 */
function calculateAgingBucket(dueDate: string, referenceDate?: Date): string {
  const due = new Date(dueDate);
  const ref = referenceDate ?? new Date();
  const diffMs = ref.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'current';
  if (diffDays <= 30) return '1-30';
  if (diffDays <= 60) return '31-60';
  if (diffDays <= 90) return '61-90';
  return '91+';
}

export const apAgingHandler: ProjectionHandler = {
  projection_type: 'ap_aging',
  event_types: [
    'ap.invoice.submitted',
    'ap.invoice.matched',
    'ap.invoice.approved',
    'ap.invoice.posted',
    'ap.invoice.paid',
    'ap.invoice.cancelled',
  ],

  async handle(event: BaseEvent, client: pg.PoolClient): Promise<void> {
    const data = event.data as Record<string, unknown>;
    const legalEntity = event.scope.legal_entity ?? 'default';

    switch (event.type) {
      case 'ap.invoice.submitted': {
        const invoiceRef = event.entities.find(
          (e) => e.entity_type === 'invoice' && e.role === 'subject',
        );
        if (!invoiceRef) return;

        const bucket = calculateAgingBucket(data.due_date as string);
        await client.query(AP_AGING_QUERIES.UPSERT, [
          generateId(),
          legalEntity,
          data.vendor_id as string,
          invoiceRef.entity_id,
          data.amount as number,
          (data.currency as string) ?? 'USD',
          data.due_date as string,
          bucket,
          'open',
          event.id,
        ]);
        break;
      }

      case 'ap.invoice.paid':
      case 'ap.invoice.cancelled': {
        const invoiceId = data.invoice_id as string;
        await client.query(AP_AGING_QUERIES.UPDATE_STATUS, [
          invoiceId,
          'closed',
          event.id,
        ]);
        break;
      }

      // For matched/approved/posted — keep as open, just update event id
      case 'ap.invoice.matched':
      case 'ap.invoice.approved':
      case 'ap.invoice.posted': {
        const invoiceId = data.invoice_id as string;
        await client.query(AP_AGING_QUERIES.UPDATE_STATUS, [
          invoiceId,
          'open',
          event.id,
        ]);
        break;
      }
    }
  },

  async reset(client: pg.PoolClient): Promise<void> {
    await client.query('TRUNCATE TABLE ap_aging');
  },
};

export { calculateAgingBucket };
