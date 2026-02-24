import type pg from 'pg';
import type { BaseEvent } from '../../event-store/types.js';
import type { ProjectionHandler } from '../../projection-engine/types.js';
import { AP_VENDOR_BALANCE_QUERIES } from './ap-vendor-balance.queries.js';

export const apVendorBalanceHandler: ProjectionHandler = {
  projection_type: 'ap_vendor_balance',
  event_types: [
    'ap.invoice.posted',
    'ap.invoice.paid',
    'ap.invoice.cancelled',
  ],

  async handle(event: BaseEvent, client: pg.PoolClient): Promise<void> {
    const data = event.data as Record<string, unknown>;
    const legalEntity = event.scope.legal_entity ?? 'default';

    switch (event.type) {
      case 'ap.invoice.posted': {
        // When invoice is posted, add to outstanding balance
        const vendorId = data.vendor_id as string;
        const amount = data.amount as number;
        const currency = (data.currency as string) ?? 'USD';

        await client.query(AP_VENDOR_BALANCE_QUERIES.UPSERT_ADD, [
          vendorId,
          legalEntity,
          amount,
          currency,
          event.id,
        ]);
        break;
      }

      case 'ap.invoice.paid': {
        // When paid, reduce outstanding balance
        const vendorId = data.vendor_id as string;
        const amount = data.amount as number;

        await client.query(AP_VENDOR_BALANCE_QUERIES.REDUCE, [
          vendorId,
          legalEntity,
          amount,
          event.id,
        ]);
        break;
      }

      case 'ap.invoice.cancelled': {
        // If cancelled after posting, reduce outstanding balance
        const vendorId = data.vendor_id as string;
        const amount = data.amount as number;
        if (!vendorId || !amount) return;

        await client.query(AP_VENDOR_BALANCE_QUERIES.REDUCE, [
          vendorId,
          legalEntity,
          amount,
          event.id,
        ]);
        break;
      }
    }
  },

  async reset(client: pg.PoolClient): Promise<void> {
    await client.query('TRUNCATE TABLE ap_vendor_balance');
  },
};
