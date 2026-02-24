import type pg from 'pg';
import type { BaseEvent } from '../event-store/types.js';

export interface ProjectionHandler {
  projection_type: string;
  event_types: string[];
  handle(event: BaseEvent, client: pg.PoolClient): Promise<void>;
  /** Reset/truncate the projection table for rebuild operations. */
  reset?(client: pg.PoolClient): Promise<void>;
}

export interface ProjectionSubscription {
  id: string;
  subscriber_id: string;
  event_types: string[];
  last_processed_seq: bigint;
}
