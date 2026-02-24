import type pg from 'pg';
import type { BaseEvent } from '../event-store/types.js';

export interface ProjectionHandler {
  event_types: string[];
  handle(event: BaseEvent, client: pg.PoolClient): Promise<void>;
}

export interface ProjectionSubscription {
  id: string;
  subscriber_id: string;
  event_types: string[];
  last_processed_seq: bigint;
}
