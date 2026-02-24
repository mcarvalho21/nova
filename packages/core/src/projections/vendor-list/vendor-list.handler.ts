import type pg from 'pg';
import type { BaseEvent } from '../../event-store/types.js';
import type { ProjectionHandler } from '../../projection-engine/types.js';
import { VENDOR_LIST_QUERIES } from './vendor-list.queries.js';

export const vendorListHandler: ProjectionHandler = {
  event_types: ['mdm.vendor.created', 'mdm.vendor.updated'],

  async handle(event: BaseEvent, client: pg.PoolClient): Promise<void> {
    const vendorRef = event.entities.find(
      (e) => e.entity_type === 'vendor' && e.role === 'subject',
    );
    if (!vendorRef) return;

    const data = event.data as { name: string; attributes?: Record<string, unknown> };

    await client.query(VENDOR_LIST_QUERIES.UPSERT, [
      vendorRef.entity_id,
      data.name,
      JSON.stringify(data.attributes ?? {}),
      event.id,
    ]);
  },
};
