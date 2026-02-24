import type pg from 'pg';
import type { BaseEvent } from '../../event-store/types.js';
import type { ProjectionHandler } from '../../projection-engine/types.js';
import { VENDOR_LIST_QUERIES } from './vendor-list.queries.js';

export const vendorListHandler: ProjectionHandler = {
  projection_type: 'vendor_list',
  event_types: ['mdm.vendor.created', 'mdm.vendor.updated'],

  async handle(event: BaseEvent, client: pg.PoolClient): Promise<void> {
    const vendorRef = event.entities.find(
      (e) => e.entity_type === 'vendor' && e.role === 'subject',
    );
    if (!vendorRef) return;

    const data = event.data as { name: string; attributes?: Record<string, unknown> };
    const legalEntity = event.scope.legal_entity ?? 'default';

    await client.query(VENDOR_LIST_QUERIES.UPSERT, [
      vendorRef.entity_id,
      data.name,
      JSON.stringify(data.attributes ?? {}),
      event.id,
      legalEntity,
    ]);
  },

  async reset(client: pg.PoolClient): Promise<void> {
    await client.query('TRUNCATE TABLE vendor_list');
  },
};
