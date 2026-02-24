import type pg from 'pg';
import type { BaseEvent } from '../../event-store/types.js';
import type { ProjectionHandler } from '../../projection-engine/types.js';
import { ITEM_LIST_QUERIES } from './item-list.queries.js';

export const itemListHandler: ProjectionHandler = {
  event_types: ['mdm.item.created'],

  async handle(event: BaseEvent, client: pg.PoolClient): Promise<void> {
    const itemRef = event.entities.find(
      (e) => e.entity_type === 'item' && e.role === 'subject',
    );
    if (!itemRef) return;

    const data = event.data as {
      name: string;
      sku?: string;
      attributes?: Record<string, unknown>;
    };

    await client.query(ITEM_LIST_QUERIES.UPSERT, [
      itemRef.entity_id,
      data.name,
      data.sku ?? null,
      JSON.stringify(data.attributes ?? {}),
      event.id,
    ]);
  },
};
